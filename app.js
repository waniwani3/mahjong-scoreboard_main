// ==========================================
// MAHJONG SCOREBOOK - CORE ENGINE & STATE
// ==========================================

// State Object
const state = {
    players: [],      // Array of { id, name }
    gameRecords: [],  // Array of Game Records
    ratings: {},      // { playerId: { elo: 1500, games: 0 } }
    activePlayers: [], // Array of IDs currently selected for the match (length 3 or 4)
    rules: {
        playerCount: 4,
        startPoints: 25000,
        returnPoints: 30000,
        uma: [10, 5, -5, -10],
        roundingRule: 'round', // none, round, goju-chuni, truncate, ceil
        useYakitori: false,
        yakitoriPenalty: 10
    },
    activeGameNumber: 1,
    currentFocusedInputId: null,
    isPremiumUnlocked: false // Premium Lock State
};

// Preset Constants for Uma
const UMA_PRESETS = {
    4: [
        { label: '5-10 (+10, +5, -5, -10)', values: [10, 5, -5, -10] },
        { label: '10-20 (+20, +10, -10, -20)', values: [20, 10, -10, -20] },
        { label: '10-30 (+30, +10, -10, -30)', values: [30, 10, -10, -30] },
        { label: 'Mリーグ (+50, +10, -10, -30)', values: [50, 10, -10, -30] }
    ],
    3: [
        { label: '10-20 (+20, 0, -20)', values: [20, 0, -20, 0] },
        { label: '10-10 (+10, 0, -10)', values: [10, 0, -10, 0] },
        { label: '5-15 (+20, -5, -15)', values: [20, -5, -15, 0] },
        { label: 'なし (0, 0, 0)', values: [0, 0, 0, 0] }
    ]
};

// ==========================================
// LOCAL STORAGE CONTROLLER
// ==========================================

const Storage = {
    load() {
        try {
            const playersData = localStorage.getItem('mj_players');
            const recordsData = localStorage.getItem('mj_records');
            const rulesData = localStorage.getItem('mj_rules');

            if (playersData) {
                state.players = JSON.parse(playersData);
            } else {
                // Default initial players
                state.players = [
                    { id: 'p1', name: 'プレイヤーA' },
                    { id: 'p2', name: 'プレイヤーB' },
                    { id: 'p3', name: 'プレイヤーC' },
                    { id: 'p4', name: 'プレイヤーD' }
                ];
                this.savePlayers();
            }

            if (recordsData) {
                state.gameRecords = JSON.parse(recordsData);
            }

            if (rulesData) {
                state.rules = JSON.parse(rulesData);
            }

            // ratingsも初期化時に読み込む
            this.loadRatings();

            // プレミアム有効化状態の読み込み
            state.isPremiumUnlocked = localStorage.getItem('mj_premium_unlocked') === 'true';

        } catch (e) {
            console.error('LocalStorage load failed, resetting state:', e);
        }
    },

    savePlayers() {
        localStorage.setItem('mj_players', JSON.stringify(state.players));
    },

    saveRecords() {
        localStorage.setItem('mj_records', JSON.stringify(state.gameRecords));
    },

    saveRules() {
        localStorage.setItem('mj_rules', JSON.stringify(state.rules));
    },

    saveRatings() {
        localStorage.setItem('mj_ratings', JSON.stringify(state.ratings));
    },
    
    loadRatings() {
        const ratingsData = localStorage.getItem('mj_ratings');
        if (ratingsData) {
            state.ratings = JSON.parse(ratingsData);
        } else {
            state.ratings = {};
        }
    },

    savePremium() {
        localStorage.setItem('mj_premium_unlocked', state.isPremiumUnlocked ? 'true' : 'false');
    }
};

// ==========================================
// MATHEMATICAL PROCESSOR (SCORING ENGINE)
// ==========================================

/**
 * Calculates raw points differences, ranks players, applies Uma & Oka, and rounds final scores.
 * Guaranteeing that the final sum equals exactly 0.0.
 */
function calculateScores(rawScores, rules, yakitoriFlags) {
    const N = Number(rules.playerCount);
    const startPoints = Number(rules.startPoints);
    const returnPoints = Number(rules.returnPoints);
    const roundingRule = rules.roundingRule;
    const uma = rules.uma.map(Number);

    // 1. Calculate Oka (added to 1st place)
    const totalOka = ((returnPoints * N) - (startPoints * N)) / 1000;

    // Create array of objects to rank
    let players = rawScores.map((score, index) => ({
        index,
        rawScore: score,
        diff: (score - returnPoints) / 1000
    }));

    // 2. Rank players (descending rawScore, then by seat index if tied)
    players.sort((a, b) => {
        if (b.rawScore !== a.rawScore) {
            return b.rawScore - a.rawScore;
        }
        return a.index - b.index; // Tiebreaker by seating order (original list index)
    });

    // Assign placement rank (1 to N)
    players.forEach((p, rankIndex) => {
        p.rank = rankIndex + 1;
    });

    // 3. Apply Uma & Oka & Yakitori
    players.forEach(p => {
        // Find matching Uma for this rank
        const playerUma = uma[p.rank - 1] || 0;
        p.exactScore = p.diff + playerUma;
        if (p.rank === 1) {
            p.exactScore += totalOka;
        }

        // Apply Yakitori adjustments
        if (rules.useYakitori && yakitoriFlags) {
            const isY = yakitoriFlags[p.index];
            const yakitoriCount = yakitoriFlags.filter(f => f).length;
            if (yakitoriCount > 0 && yakitoriCount < N) {
                const penalty = Number(rules.yakitoriPenalty);
                // Deduct penalty from Yakitori players
                if (isY) {
                    p.exactScore -= penalty;
                }
                // Credit the total penalty pool to the 1st place player
                if (p.rank === 1) {
                    p.exactScore += yakitoriCount * penalty;
                }
            }
        }
    });

    // 4. Apply Rounding Rule
    // We round points (e.g. +35.3). Standard Japanese rounding is usually performed on final points.
    players.forEach(p => {
        if (roundingRule === 'rank-ceil-floor') {
            if (p.rank <= 2) {
                p.roundedScore = Math.ceil(p.exactScore);
            } else {
                p.roundedScore = Math.floor(p.exactScore);
            }
        } else if (roundingRule === 'rank-floor-ceil') {
            if (p.rank <= 2) {
                p.roundedScore = Math.floor(p.exactScore);
            } else {
                p.roundedScore = Math.ceil(p.exactScore);
            }
        } else {
            p.roundedScore = roundPoint(p.exactScore, roundingRule);
        }
    });

    // 5. Zero-Sum Adjuster
    // Check if the sum of rounded points equals exactly 0
    let roundedSum = players.reduce((sum, p) => sum + p.roundedScore, 0);

    // Clean float rounding errors in sum
    roundedSum = Math.round(roundedSum * 10) / 10;

    if (roundedSum !== 0 && roundingRule !== 'none') {
        // Adjust the difference on the 1st place player
        const adjustment = -roundedSum;
        const p1 = players.find(p => p.rank === 1);
        if (p1) {
            p1.roundedScore = Math.round((p1.roundedScore + adjustment) * 10) / 10;
        }
    }

    // Sort back to original input order
    players.sort((a, b) => a.index - b.index);

    return players;
}

/**
 * Rounds a point value based on the chosen rule.
 * Mahjong points are represented to 1 decimal place (100 raw points = 0.1 score points).
 */
function roundPoint(val, rule) {
    if (rule === 'none') {
        return Math.round(val * 10) / 10;
    }

    // Convert score points back to raw point representation for rounding (e.g. +5.3 -> 5.3)
    // We want to round to the nearest whole integer (which represents 1,000 raw points).
    switch (rule) {
        case 'round': // Standard rounding (四捨五入)
            return Math.round(val);

        case 'goju-chuni': // 五捨六入 (0.5 is rounded down, 0.6 is rounded up)
            // If the fractional part is <= 0.5, round down. If >= 0.6, round up.
            // Be careful with negative numbers:
            // For positive: 5.5 -> 5.0, 5.6 -> 6.0
            // For negative: -5.5 -> -6.0 (since it's -500 points, does it go to -6k or -5k? Usually -5.5 points is -5,500 difference, rounds down to -6,000 points. Wait, 5捨6入 means: fractional part of raw score <= 500 is discarded, >= 600 is rounded up.)
            // Let's implement it clearly:
            const frac = val - Math.floor(val);
            if (frac > 0.5) {
                return Math.ceil(val);
            } else {
                return Math.floor(val);
            }

        case 'truncate': // 切り捨て
            return Math.floor(val);

        case 'ceil': // 切り上げ
            return Math.ceil(val);

        default:
            return Math.round(val);
    }
}

// ==========================================
// UI INTERACTION & RENDERING SYSTEM
// ==========================================

const DOM = {
    // Navigation Tabs
    tabs: document.querySelectorAll('[data-tab]'),
    panels: document.querySelectorAll('.view-panel'),

    // Setup Panel
    ruleType: document.getElementById('rule-type'),
    startPoints: document.getElementById('start-points'),
    returnPoints: document.getElementById('return-points'),
    umaInputs: [
        document.getElementById('uma-1'),
        document.getElementById('uma-2'),
        document.getElementById('uma-3'),
        document.getElementById('uma-4')
    ],
    umaPresetsContainer: document.getElementById('uma-presets'),
    roundingRule: document.getElementById('rounding-rule'),
    useYakitori: document.getElementById('use-yakitori'),
    yakitoriPenalty: document.getElementById('yakitori-penalty'),
    yakitoriPointsGroup: document.getElementById('yakitori-points-group'),
    newPlayerName: document.getElementById('new-player-name'),
    addPlayerBtn: document.getElementById('add-player-btn'),
    playerRoster: document.getElementById('player-roster'),
    selectionSummary: document.getElementById('selection-summary'),
    startSessionBtn: document.getElementById('start-session-btn'),

    // Game Entry Panel
    activeGameTitle: document.getElementById('active-game-title'),
    gameDate: document.getElementById('game-date'),
    scoreEntriesContainer: document.getElementById('score-entries-container'),
    autofillBtn: document.getElementById('autofill-btn'),
    clearScoresBtn: document.getElementById('clear-scores-btn'),
    validatorMsg: document.getElementById('validator-msg'),
    saveRoundBtn: document.getElementById('save-round-btn'),
    keypadBtns: document.querySelectorAll('.keypad-btn'),

    // History Panel
    filterYear: document.getElementById('filter-year'),
    filterMonth: document.getElementById('filter-month'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    historyListContainer: document.getElementById('history-list-container'),

    // Stats Panel
    statsPeriod: document.getElementById('stats-period'),
    leaderboardContainer: document.getElementById('leaderboard-container'),
    exportTextArea: document.getElementById('export-text-area'),
    copyReportBtn: document.getElementById('copy-report-btn'),

    init() {
        if (state.rules.useYakitori !== undefined) {
            this.useYakitori.checked = state.rules.useYakitori;
            this.yakitoriPenalty.value = state.rules.yakitoriPenalty || 10;
            this.yakitoriPointsGroup.style.display = state.rules.useYakitori ? 'flex' : 'none';
        } else {
            state.rules.useYakitori = false;
            state.rules.yakitoriPenalty = 10;
        }

        this.setupTabNavigation();
        this.setupEventListeners();
        this.renderPlayerRoster();
        this.updateUmaPresets();
        this.renderHistory();
        this.renderStats();

        // プレミアム機能の初期化
        this.initPremium();

        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        this.gameDate.value = today;
    },

    setupTabNavigation() {
        const switchTab = (tabId) => {
            this.tabs.forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
            });
            this.panels.forEach(panel => {
                panel.classList.toggle('active', panel.id === tabId);
            });

            // Re-render contextual screens on tab switch
            if (tabId === 'history') {
                this.renderHistory();
            } else if (tabId === 'stats') {
                this.renderStats();
            } else if (tabId === 'game') {
                this.renderActiveGameScreen();
            }
        };

        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.getAttribute('data-tab'));
            });
        });
    },

    setupEventListeners() {
        // Rule Mode changes
        this.ruleType.addEventListener('change', () => {
            const count = Number(this.ruleType.value);
            state.rules.playerCount = count;

            // Adjust defaults based on 3-player or 4-player
            if (count === 3) {
                this.startPoints.value = 35000;
                this.returnPoints.value = 40000;
                state.rules.startPoints = 35000;
                state.rules.returnPoints = 40000;

                // Hide 4th Uma input
                this.umaInputs[3].classList.add('four-player-only');
                this.umaInputs[3].style.display = 'none';

                // Default Uma values for 3-player
                this.umaInputs[0].value = 20;
                this.umaInputs[1].value = 0;
                this.umaInputs[2].value = -20;
                this.umaInputs[3].value = 0;
            } else {
                this.startPoints.value = 25000;
                this.returnPoints.value = 30000;
                state.rules.startPoints = 25000;
                state.rules.returnPoints = 30000;

                // Show 4th Uma input
                this.umaInputs[3].classList.remove('four-player-only');
                this.umaInputs[3].style.display = 'block';

                // Default Uma values for 4-player
                this.umaInputs[0].value = 10;
                this.umaInputs[1].value = 5;
                this.umaInputs[2].value = -5;
                this.umaInputs[3].value = -10;
            }

            state.rules.uma = this.umaInputs.map(input => Number(input.value) || 0);

            // Update presets and selections
            this.updateUmaPresets();
            this.updatePlayerSelectionSummary();
            Storage.saveRules();
        });

        // Numeric Preset button triggers
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = btn.getAttribute('data-target');
                const val = Number(btn.getAttribute('data-val'));
                const input = document.getElementById(targetId);

                if (input) {
                    input.value = val;
                    state.rules[targetId === 'start-points' ? 'startPoints' : 'returnPoints'] = val;
                    Storage.saveRules();

                    // Toggle active preset button class
                    btn.parentElement.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        });

        // Points Input focus/blur change
        const savePointsInput = () => {
            state.rules.startPoints = Number(this.startPoints.value) || 25000;
            state.rules.returnPoints = Number(this.returnPoints.value) || 30000;
            Storage.saveRules();
        };
        this.startPoints.addEventListener('change', savePointsInput);
        this.returnPoints.addEventListener('change', savePointsInput);

        // Uma Inputs change
        this.umaInputs.forEach((input, index) => {
            input.addEventListener('change', () => {
                state.rules.uma[index] = Number(input.value) || 0;
                Storage.saveRules();

                // Highlight custom preset if manual modification is made
                document.querySelectorAll('#uma-presets .preset-btn').forEach(b => b.classList.remove('active'));
            });
        });

        // Rounding Rule changes
        this.roundingRule.addEventListener('change', () => {
            state.rules.roundingRule = this.roundingRule.value;
            Storage.saveRules();
        });

        // Yakitori Rule changes
        this.useYakitori.addEventListener('change', () => {
            state.rules.useYakitori = this.useYakitori.checked;
            this.yakitoriPointsGroup.style.display = this.useYakitori.checked ? 'flex' : 'none';
            Storage.saveRules();
            // If we are currently entering a game, re-render it to show/hide yakitori toggles
            if (document.getElementById('game').classList.contains('active')) {
                this.renderActiveGameScreen();
            }
        });

        this.yakitoriPenalty.addEventListener('change', () => {
            state.rules.yakitoriPenalty = Number(this.yakitoriPenalty.value) || 10;
            Storage.saveRules();
            this.validateScoresLive();
        });

        // Add Player
        const handleAddPlayer = () => {
            const name = this.newPlayerName.value.trim();
            if (!name) return;

            // Check for duplicates
            if (state.players.some(p => p.name === name)) {
                alert('同じ名前のプレイヤーが既に存在します。');
                return;
            }

            const newPlayer = {
                id: 'p_' + Date.now(),
                name: name
            };
            state.players.push(newPlayer);
            this.newPlayerName.value = '';
            this.renderPlayerRoster();
            Storage.savePlayers();
        };
        this.addPlayerBtn.addEventListener('click', handleAddPlayer);
        this.newPlayerName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAddPlayer();
        });

        // Start Session Button
        this.startSessionBtn.addEventListener('click', () => {
            // Find active game number for the selected date
            const date = this.gameDate.value;
            const dailyGames = state.gameRecords.filter(r => r.date === date);
            state.activeGameNumber = dailyGames.length + 1;

            // Switch to entry screen
            const tabBtn = document.querySelector('[data-tab="game"]');
            if (tabBtn) tabBtn.click();
        });

        // Input Keyboard interaction
        this.keypadBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-key');
                if (!state.currentFocusedInputId) return;

                const input = document.getElementById(state.currentFocusedInputId);
                if (!input) return;

                let currentVal = input.value;

                if (key === 'clear') {
                    input.value = '';
                } else if (key === 'back') {
                    input.value = currentVal.slice(0, -1);
                } else if (key === 'next') {
                    // Jump to next input card
                    const inputs = Array.from(document.querySelectorAll('.score-input'));
                    const currentIndex = inputs.indexOf(input);
                    const nextInput = inputs[(currentIndex + 1) % inputs.length];
                    if (nextInput) nextInput.focus();
                } else if (key === '-') {
                    if (currentVal.startsWith('-')) {
                        input.value = currentVal.slice(1);
                    } else {
                        input.value = '-' + currentVal;
                    }
                } else {
                    // Numbers
                    input.value = currentVal + key;
                }

                // Trigger change event to calculate points live
                input.dispatchEvent(new Event('input'));
            });
        });

        // Auto-fill button click
        this.autofillBtn.addEventListener('click', () => {
            const inputs = Array.from(document.querySelectorAll('.score-input'));
            const emptyInputs = inputs.filter(input => input.value === '');

            if (emptyInputs.length !== 1) {
                alert('自動計算機能は、最後の1人のスコアが未入力の場合のみ使用できます。');
                return;
            }

            const targetInput = emptyInputs[0];
            const sumOfOthers = inputs
                .filter(input => input !== targetInput)
                .reduce((sum, input) => sum + (Number(input.value) || 0), 0);

            const totalExpected = Number(state.rules.startPoints) * Number(state.rules.playerCount);
            targetInput.value = totalExpected - sumOfOthers;
            targetInput.dispatchEvent(new Event('input'));
        });

        // Clear scores
        this.clearScoresBtn.addEventListener('click', () => {
            document.querySelectorAll('.score-input').forEach(input => {
                input.value = '';
                input.dispatchEvent(new Event('input'));
            });
        });

        // Save round score button
        this.saveRoundBtn.addEventListener('click', () => {
            this.saveGameRecord();
        });

        // History filters
        this.filterYear.addEventListener('change', () => this.renderHistory());
        this.filterMonth.addEventListener('change', () => this.renderHistory());

        // Clear history button
        this.clearHistoryBtn.addEventListener('click', () => {
            if (confirm('すべての対局データを削除しますか？この操作は取り消せません。')) {
                state.gameRecords = [];
                Storage.saveRecords();
                this.renderHistory();
                this.renderStats();
            }
        });

        // Stats period changes
        this.statsPeriod.addEventListener('change', () => {
            this.renderStats();
        });

        // Export / Import JSON functionality
        this.exportJsonBtn = document.getElementById('export-json-btn');
        this.importJsonBtn = document.getElementById('import-json-btn');
        this.importJsonInput = document.getElementById('import-json-input');

        // Export current data as JSON file
        this.exportJsonBtn.addEventListener('click', () => {
            const exportData = {
                players: state.players,
                gameRecords: state.gameRecords,
                rules: state.rules
            };
            const jsonStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const today = new Date().toISOString().split('T')[0];
            a.download = `mahjong_data_${today}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // Trigger hidden file input for import
        this.importJsonBtn.addEventListener('click', () => {
            this.importJsonInput.value = '';
            this.importJsonInput.click();
        });

        // Handle file selection and load data
        this.importJsonInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.players) {
                        state.players = data.players;
                        Storage.savePlayers();
                        this.renderPlayerRoster();
                    }
                    if (data.rules) {
                        state.rules = data.rules;
                        Storage.saveRules();
                        // Update UI controls to reflect imported rules
                        this.ruleType.value = state.rules.playerCount;
                        this.startPoints.value = state.rules.startPoints;
                        this.returnPoints.value = state.rules.returnPoints;
                        this.umaInputs.forEach((inp, i) => inp.value = state.rules.uma[i] ?? 0);
                        this.roundingRule.value = state.rules.roundingRule;
                        this.useYakitori.checked = state.rules.useYakitori;
                        this.yakitoriPenalty.value = state.rules.yakitoriPenalty;
                        this.yakitoriPointsGroup.style.display = state.rules.useYakitori ? 'flex' : 'none';
                    }
                    if (data.gameRecords) {
                        state.gameRecords = data.gameRecords;
                        Storage.saveRecords();
                        this.renderHistory();
                        this.renderStats();
                    }
                    alert('データのインポートが完了しました。');
                } catch (err) {
                    console.error(err);
                    alert('インポート中にエラーが発生しました。JSON形式を確認してください。');
                }
            };
            reader.readAsText(file);
        });

        // コピーボタン
        this.copyReportBtn.addEventListener('click', () => {
            const text = this.exportTextArea.textContent;
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => {
                const original = this.copyReportBtn.innerHTML;
                this.copyReportBtn.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
                setTimeout(() => { this.copyReportBtn.innerHTML = original; }, 2000);
            }).catch(() => {
                // フォールバック（古いブラウザ対応）
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
        });
    },

    updateUmaPresets() {
        const count = state.rules.playerCount;
        const presets = UMA_PRESETS[count] || [];

        this.umaPresetsContainer.innerHTML = '';

        presets.forEach(p => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preset-btn';
            btn.textContent = p.label.split(' ')[0];

            // Check if current Uma matches this preset
            const isMatch = p.values.slice(0, count).every((val, idx) => val === state.rules.uma[idx]);
            if (isMatch) btn.classList.add('active');

            btn.addEventListener('click', () => {
                this.umaPresetsContainer.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                p.values.forEach((val, idx) => {
                    if (this.umaInputs[idx]) {
                        this.umaInputs[idx].value = val;
                        state.rules.uma[idx] = val;
                    }
                });
                Storage.saveRules();
            });

            this.umaPresetsContainer.appendChild(btn);
        });
    },

    renderPlayerRoster() {
        this.playerRoster.innerHTML = '';

        state.players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'roster-item';

            const checkboxLabel = document.createElement('label');
            checkboxLabel.style.display = 'flex';
            checkboxLabel.style.alignItems = 'center';
            checkboxLabel.style.gap = '0.75rem';
            checkboxLabel.style.margin = '0';
            checkboxLabel.style.cursor = 'pointer';
            checkboxLabel.style.color = '#e0e6e3';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.width = 'auto';
            checkbox.checked = state.activePlayers.includes(p.id);

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    if (state.activePlayers.length >= state.rules.playerCount) {
                        checkbox.checked = false;
                        alert(`${state.rules.playerCount}人打ちモードが設定されています。参加枠を空けてから選択してください。`);
                        return;
                    }
                    state.activePlayers.push(p.id);
                } else {
                    state.activePlayers = state.activePlayers.filter(id => id !== p.id);
                }
                this.updatePlayerSelectionSummary();
            });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'roster-name';
            nameSpan.textContent = p.name;

            checkboxLabel.appendChild(checkbox);
            checkboxLabel.appendChild(nameSpan);

            const actions = document.createElement('div');
            actions.className = 'roster-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn action-delete';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`本当にプレイヤー「${p.name}」を削除しますか？過去の対局履歴のスコアは削除されません。`)) {
                    state.players = state.players.filter(item => item.id !== p.id);
                    state.activePlayers = state.activePlayers.filter(id => id !== p.id);
                    this.renderPlayerRoster();
                    this.updatePlayerSelectionSummary();
                    Storage.savePlayers();
                }
            });

            actions.appendChild(deleteBtn);
            item.appendChild(checkboxLabel);
            item.appendChild(actions);
            this.playerRoster.appendChild(item);
        });

        this.updatePlayerSelectionSummary();
    },

    updatePlayerSelectionSummary() {
        const selectedCount = state.activePlayers.length;
        const requiredCount = state.rules.playerCount;

        this.selectionSummary.textContent = `選択中: ${selectedCount} / ${requiredCount} 名`;

        if (selectedCount === requiredCount) {
            this.selectionSummary.style.color = 'var(--accent-green)';
            this.startSessionBtn.disabled = false;
        } else {
            this.selectionSummary.style.color = 'var(--accent-gold)';
            this.startSessionBtn.disabled = true;
        }
    },

    renderActiveGameScreen() {
        const required = state.rules.playerCount;
        if (state.activePlayers.length !== required) {
            this.scoreEntriesContainer.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 2rem 0;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 1rem; color: var(--accent-gold);"></i>
                    <p>対局プレイヤーの選択が不十分です。まず「設定」タブから ${required} 名のプレイヤーを選択してください。</p>
                </div>
            `;
            this.saveRoundBtn.disabled = true;
            this.autofillBtn.disabled = true;
            return;
        }

        this.saveRoundBtn.disabled = false;
        this.autofillBtn.disabled = false;

        const date = this.gameDate.value;
        const dailyGames = state.gameRecords.filter(r => r.date === date);
        state.activeGameNumber = dailyGames.length + 1;
        this.activeGameTitle.textContent = `対局スコア入力 (第 ${state.activeGameNumber} 戦)`;

        this.scoreEntriesContainer.innerHTML = '';

        // Standard seating directions: 東, 南, 西, 北
        const seats = ['東', '南', '西', '北'];

        state.activePlayers.forEach((playerId, index) => {
            const player = state.players.find(p => p.id === playerId) || { name: 'Unknown' };
            const seat = seats[index] || '';

            const card = document.createElement('div');
            card.className = 'player-score-entry';
            card.id = `entry-card-${playerId}`;

            const header = document.createElement('div');
            header.className = 'player-header';

            const label = document.createElement('div');
            label.className = 'player-label';

            const badge = document.createElement('span');
            badge.className = 'seating-badge';
            badge.textContent = seat;

            const name = document.createElement('span');
            name.textContent = player.name;

            label.appendChild(badge);
            label.appendChild(name);
            header.appendChild(label);

            // Calculation preview output
            const preview = document.createElement('div');
            preview.className = 'diff-preview';
            preview.id = `preview-${playerId}`;
            preview.textContent = '0.0 pt';
            header.appendChild(preview);

            const inputContainer = document.createElement('div');
            inputContainer.className = 'input-container';

            const input = document.createElement('input');
            input.type = 'number';
            input.pattern = '[0-9]*';
            input.className = 'score-input';
            input.id = `score-input-${playerId}`;
            input.placeholder = '0';

            input.addEventListener('focus', () => {
                state.currentFocusedInputId = input.id;
                document.querySelectorAll('.player-score-entry').forEach(c => c.classList.remove('focused'));
                card.classList.add('focused');
            });

            input.addEventListener('input', () => {
                this.validateScoresLive();
            });

            const unit = document.createElement('span');
            unit.className = 'input-unit';
            unit.textContent = '点';

            inputContainer.appendChild(input);
            inputContainer.appendChild(unit);

            card.appendChild(header);
            card.appendChild(inputContainer);

            // If Yakitori rule is active, render Yakitori checkbox
            if (state.rules.useYakitori) {
                const yakitoriContainer = document.createElement('div');
                yakitoriContainer.className = 'yakitori-toggle-container';
                yakitoriContainer.style.marginTop = '0.5rem';
                yakitoriContainer.style.display = 'flex';
                yakitoriContainer.style.alignItems = 'center';

                const yakitoriLabel = document.createElement('label');
                yakitoriLabel.style.display = 'flex';
                yakitoriLabel.style.alignItems = 'center';
                yakitoriLabel.style.gap = '0.35rem';
                yakitoriLabel.style.fontSize = '0.85rem';
                yakitoriLabel.style.color = '#8c9c96';
                yakitoriLabel.style.margin = '0';
                yakitoriLabel.style.cursor = 'pointer';

                const yakitoriCheckbox = document.createElement('input');
                yakitoriCheckbox.type = 'checkbox';
                yakitoriCheckbox.className = 'yakitori-checkbox';
                yakitoriCheckbox.dataset.playerId = playerId;
                yakitoriCheckbox.style.width = 'auto';
                yakitoriCheckbox.style.margin = '0';

                yakitoriCheckbox.addEventListener('change', () => {
                    this.validateScoresLive();
                });

                const yakitoriText = document.createElement('span');
                yakitoriText.textContent = '焼き鳥 (アガリなし)';

                yakitoriLabel.appendChild(yakitoriCheckbox);
                yakitoriLabel.appendChild(yakitoriText);
                yakitoriContainer.appendChild(yakitoriLabel);
                card.appendChild(yakitoriContainer);
            }

            this.scoreEntriesContainer.appendChild(card);
        });

        this.validateScoresLive();
    },

    validateScoresLive() {
        const inputs = Array.from(document.querySelectorAll('.score-input'));
        const playerCount = Number(state.rules.playerCount);
        const startPoints = Number(state.rules.startPoints);
        const expectedTotal = startPoints * playerCount;

        let currentTotal = 0;
        let filledCount = 0;
        const scores = [];

        inputs.forEach(input => {
            const val = input.value;
            if (val !== '') {
                currentTotal += Number(val);
                filledCount++;
                scores.push(Number(val));
            } else {
                scores.push(null);
            }
        });

        // 1. Update Validation Message Panel
        this.validatorMsg.className = 'validator-bar';
        if (currentTotal === expectedTotal && filledCount === playerCount) {
            this.validatorMsg.classList.add('valid');
            this.validatorMsg.innerHTML = `
                <span>合計点: ${currentTotal.toLocaleString()} / ${expectedTotal.toLocaleString()} 点 (一致)</span>
                <i class="fa-solid fa-circle-check"></i>
            `;
            this.saveRoundBtn.disabled = false;
        } else {
            this.validatorMsg.classList.add('invalid');
            const diff = currentTotal - expectedTotal;
            const diffText = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();

            this.validatorMsg.innerHTML = `
                <span>合計点: ${currentTotal.toLocaleString()} / ${expectedTotal.toLocaleString()} 点 (${diffText})</span>
                <i class="fa-solid fa-triangle-exclamation"></i>
            `;
            this.saveRoundBtn.disabled = true;
        }

        // 2. Update Points Previews Real-time if valid
        if (currentTotal === expectedTotal && filledCount === playerCount) {
            const yakitoriFlags = [];
            state.activePlayers.forEach(playerId => {
                const cb = document.querySelector(`.yakitori-checkbox[data-player-id="${playerId}"]`);
                yakitoriFlags.push(cb ? cb.checked : false);
            });

            const calculated = calculateScores(scores, state.rules, yakitoriFlags);
            state.activePlayers.forEach((playerId, index) => {
                const preview = document.getElementById(`preview-${playerId}`);
                if (preview) {
                    const playerCalc = calculated[index];
                    const pts = playerCalc.roundedScore;
                    const formatted = pts > 0 ? `+${pts.toFixed(1)}` : pts.toFixed(1);

                    preview.textContent = `${formatted} pt (順位:${playerCalc.rank}位)`;
                    preview.className = 'diff-preview ' + (pts >= 0 ? 'diff-positive' : 'diff-negative');
                }
            });
        } else {
            // Live partial difference relative to baseline
            state.activePlayers.forEach((playerId, index) => {
                const preview = document.getElementById(`preview-${playerId}`);
                const input = document.getElementById(`score-input-${playerId}`);

                if (preview && input && input.value !== '') {
                    const rawVal = Number(input.value);
                    const diff = (rawVal - state.rules.returnPoints) / 1000;
                    const formatted = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
                    preview.textContent = `${formatted} pt`;
                    preview.className = 'diff-preview ' + (diff >= 0 ? 'diff-positive' : 'diff-negative');
                } else if (preview) {
                    preview.textContent = '0.0 pt';
                    preview.className = 'diff-preview';
                }
            });
        }
    },

    saveGameRecord() {
        const inputs = Array.from(document.querySelectorAll('.score-input'));
        const scores = inputs.map(input => Number(input.value) || 0);

        const yakitoriFlags = [];
        state.activePlayers.forEach(playerId => {
            const cb = document.querySelector(`.yakitori-checkbox[data-player-id="${playerId}"]`);
            yakitoriFlags.push(cb ? cb.checked : false);
        });

        const calculated = calculateScores(scores, state.rules, yakitoriFlags);

        const date = this.gameDate.value;
        const dailyGames = state.gameRecords.filter(r => r.date === date);
        const gameNumber = dailyGames.length + 1;

        const record = {
            id: 'game_' + Date.now(),
            date: date,
            gameNumber: gameNumber,
            playerCount: state.rules.playerCount,
            results: state.activePlayers.map((playerId, index) => ({
                playerId: playerId,
                rawScore: scores[index],
                netScore: calculated[index].roundedScore,
                rank: calculated[index].rank,
                yakitori: yakitoriFlags[index] || false
            }))
        };

        state.gameRecords.push(record);
        Storage.saveRecords();

        // ELOレーティング更新（4人打ちのみ）
        if (Number(state.rules.playerCount) === 4) {
            this.updateEloRatings(record);
            Storage.saveRatings();
        }

        // 入力欄リセット
        document.querySelectorAll('.score-input').forEach(input => {
            input.value = '';
        });

        const newDailyGames = state.gameRecords.filter(r => r.date === date);
        state.activeGameNumber = newDailyGames.length + 1;
        this.activeGameTitle.textContent = `対局スコア入力 (第 ${state.activeGameNumber} 戦)`;
        this.validateScoresLive();

        this.renderHistory();
        this.renderStats();

        // 履歴タブへ移動
        const historyTab = document.querySelector('[data-tab="history"]');
        if (historyTab) historyTab.click();
    },

    // ==========================================
    // ELO RATING ENGINE (4人打ち専用)
    // ==========================================
    updateEloRatings(record) {
        // 4人打ち以外はスキップ（将来3人打ち対応を別途追加予定）
        if (Number(record.playerCount) !== 4) return;

        const results = record.results;

        // 各プレイヤーのレーティング初期化（未登録の場合は1500から）
        results.forEach(res => {
            if (!state.ratings[res.playerId]) {
                state.ratings[res.playerId] = { elo: 1500, games: 0 };
            }
        });

        // K係数を対局数に応じて決定
        const getKFactor = (games) => {
            if (games < 10) return 40;
            if (games < 30) return 24;
            return 16;
        };

        // 各プレイヤーのElo変動量を計算（他3人との1対1対戦として扱う）
        const eloDeltas = {};
        results.forEach(res => {
            eloDeltas[res.playerId] = 0;
        });

        // 全ペアで比較
        for (let i = 0; i < results.length; i++) {
            for (let j = i + 1; j < results.length; j++) {
                const piId = results[i].playerId;
                const pjId = results[j].playerId;

                const eloI = state.ratings[piId].elo;
                const eloJ = state.ratings[pjId].elo;
                const gamesI = state.ratings[piId].games;
                const gamesJ = state.ratings[pjId].games;

                const kI = getKFactor(gamesI);
                const kJ = getKFactor(gamesJ);

                // 期待勝率 (I から見た J との対戦)
                const expectedI = 1 / (1 + Math.pow(10, (eloJ - eloI) / 400));
                const expectedJ = 1 - expectedI;

                // 実際の勝敗スコア（順位が低い数字=高順位が勝ち: 1位 > 2位 > 3位 > 4位）
                let actualI, actualJ;
                if (results[i].rank < results[j].rank) {
                    actualI = 1;
                    actualJ = 0;
                } else if (results[i].rank > results[j].rank) {
                    actualI = 0;
                    actualJ = 1;
                } else {
                    actualI = 0.5;
                    actualJ = 0.5;
                }

                eloDeltas[piId] += kI * (actualI - expectedI);
                eloDeltas[pjId] += kJ * (actualJ - expectedJ);
            }
        }

        // Eloを更新（小数点以下1桁で保持）
        results.forEach(res => {
            const id = res.playerId;
            state.ratings[id].elo = Math.round((state.ratings[id].elo + eloDeltas[id]) * 10) / 10;
            state.ratings[id].games += 1;
        });
    },

    renderHistory() {
        const container = this.historyListContainer;
        container.innerHTML = '';

        if (state.gameRecords.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 2rem 0;">
                    <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>対局データがありません。「設定」からプレイヤーを選んでスコアを入力してください。</p>
                </div>
            `;
            return;
        }

        // Get unique years and months for filter dropdowns
        const years = new Set();
        const months = new Set();

        state.gameRecords.forEach(r => {
            const parts = r.date.split('-');
            if (parts[0]) years.add(parts[0]);
            if (parts[1]) months.add(parts[1]);
        });

        // Update filters dropdown
        const currentYearFilter = this.filterYear.value;
        const currentMonthFilter = this.filterMonth.value;

        this.filterYear.innerHTML = '<option value="all">すべての年</option>';
        Array.from(years).sort().reverse().forEach(y => {
            this.filterYear.innerHTML += `<option value="${y}">${y}年</option>`;
        });

        this.filterMonth.innerHTML = '<option value="all">すべての月</option>';
        Array.from(months).sort().forEach(m => {
            this.filterMonth.innerHTML += `<option value="${m}">${m}月</option>`;
        });

        this.filterYear.value = currentYearFilter;
        this.filterMonth.value = currentMonthFilter;

        // Apply filters to records
        let filteredRecords = [...state.gameRecords];
        if (this.filterYear.value !== 'all') {
            filteredRecords = filteredRecords.filter(r => r.date.startsWith(this.filterYear.value));
        }
        if (this.filterMonth.value !== 'all') {
            filteredRecords = filteredRecords.filter(r => {
                const monthPart = r.date.split('-')[1];
                return monthPart === this.filterMonth.value;
            });
        }

        // Group filtered records by date
        const groupedByDate = {};
        filteredRecords.forEach(r => {
            if (!groupedByDate[r.date]) {
                groupedByDate[r.date] = [];
            }
            groupedByDate[r.date].push(r);
        });

        // Sort dates in reverse chronological order
        const sortedDates = Object.keys(groupedByDate).sort().reverse();

        if (sortedDates.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 2rem 0;">
                    <i class="fa-solid fa-filter" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>指定されたフィルターに一致するデータはありません。</p>
                </div>
            `;
            return;
        }

        sortedDates.forEach(date => {
            const games = groupedByDate[date];
            // Sort games within date by gameNumber
            games.sort((a, b) => a.gameNumber - b.gameNumber);

            const sessionDiv = document.createElement('div');
            sessionDiv.className = 'day-session';

            // Calculate daily totals for each player active on this date
            const dailyNetTotals = {};
            games.forEach(game => {
                game.results.forEach(res => {
                    if (!dailyNetTotals[res.playerId]) {
                        dailyNetTotals[res.playerId] = 0;
                    }
                    dailyNetTotals[res.playerId] += res.netScore;
                });
            });

            // Header for the date group
            const header = document.createElement('div');
            header.className = 'day-header';

            const title = document.createElement('div');
            title.className = 'day-title';
            title.innerHTML = `<i class="fa-regular fa-calendar-check text-gold"></i> ${date} (${games.length}半荘)`;

            const stats = document.createElement('div');
            stats.className = 'day-stats';
            stats.textContent = '詳細を開く';

            header.appendChild(title);
            header.appendChild(stats);

            // Daily scores subtotal summary
            const summaryRow = document.createElement('div');
            summaryRow.className = 'day-scores-summary';

            Object.keys(dailyNetTotals).forEach(playerId => {
                const player = state.players.find(p => p.id === playerId) || { name: 'Unknown' };
                const total = dailyNetTotals[playerId];
                const totalText = total > 0 ? `+${total.toFixed(1)}` : total.toFixed(1);

                const badge = document.createElement('span');
                badge.className = 'summary-badge';
                badge.innerHTML = `
                    <span style="color: #8c9c96;">${player.name}:</span>
                    <span class="${total >= 0 ? 'diff-positive' : 'diff-negative'}">${totalText}</span>
                `;
                summaryRow.appendChild(badge);
            });

            // Container for rounds
            const roundsContainer = document.createElement('div');
            roundsContainer.className = 'day-rounds';

            games.forEach(game => {
                const row = document.createElement('div');
                row.className = 'round-row';

                const num = document.createElement('div');
                num.className = 'round-number';
                num.textContent = `第${game.gameNumber}戦`;

                const scoresGrid = document.createElement('div');
                scoresGrid.className = 'round-scores-grid';

                // Sort results by rank so scores look organized (1st place first)
                const sortedResults = [...game.results].sort((a, b) => a.rank - b.rank);

                sortedResults.forEach(res => {
                    const player = state.players.find(p => p.id === res.playerId) || { name: 'Unknown' };
                    const formattedScore = res.netScore > 0 ? `+${res.netScore.toFixed(1)}` : res.netScore.toFixed(1);

                    const scoreStat = document.createElement('div');
                    scoreStat.className = 'round-player-stat';
                    const yakitoriBadge = res.yakitori ? `<span style="background-color: var(--accent-red); color: white; font-size: 0.65rem; font-weight: bold; padding: 0.05rem 0.25rem; border-radius: 4px; margin-left: 0.25rem;">焼</span>` : '';
                    scoreStat.innerHTML = `
                        <span class="round-player-name">${player.name} (${res.rank}位)${yakitoriBadge}</span>
                        <span class="${res.netScore >= 0 ? 'diff-positive' : 'diff-negative'}" style="font-weight: 700;">
                            ${formattedScore} <span style="font-size:0.7rem; font-weight:normal; color:#8c9c96;">(${Math.round(res.rawScore / 100) / 10}k)</span>
                        </span>
                    `;
                    scoresGrid.appendChild(scoreStat);
                });

                const actions = document.createElement('div');
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-round-btn';
                deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                deleteBtn.addEventListener('click', () => {
                    if (confirm(`本当にこの対局（${date} 第${game.gameNumber}戦）の記録を削除しますか？`)) {
                        state.gameRecords = state.gameRecords.filter(r => r.id !== game.id);
                        Storage.saveRecords();
                        this.renderHistory();
                        this.renderStats();
                    }
                });

                actions.appendChild(deleteBtn);

                row.appendChild(num);
                row.appendChild(scoresGrid);
                row.appendChild(actions);

                roundsContainer.appendChild(row);
            });

            // Toggle expansion
            header.addEventListener('click', () => {
                const isHidden = roundsContainer.style.display === 'none';
                roundsContainer.style.display = isHidden ? 'flex' : 'none';
                stats.textContent = isHidden ? '詳細を閉じる' : '詳細を開く';
            });

            sessionDiv.appendChild(header);
            sessionDiv.appendChild(summaryRow);
            sessionDiv.appendChild(roundsContainer);
            container.appendChild(sessionDiv);
        });
    },

    renderStats() {
        const container = this.leaderboardContainer;
        container.innerHTML = '';

        if (state.gameRecords.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 2rem 0;">
                    <i class="fa-solid fa-chart-pie" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>対局データがないため、成績集計を表示できません。</p>
                </div>
            `;
            this.exportTextArea.textContent = '対局データがありません。';
            return;
        }

        // Apply selected period filter
        const period = this.statsPeriod.value;
        const now = new Date();
        const currentYear = now.getFullYear().toString();
        const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
        const filterPrefix = currentYear + '-' + currentMonth;

        let filtered = [...state.gameRecords];
        let periodTitle = '通算成績';

        if (period === 'year') {
            filtered = filtered.filter(r => r.date.startsWith(currentYear));
            periodTitle = `${currentYear}年度 成績`;
        } else if (period === 'month') {
            filtered = filtered.filter(r => r.date.startsWith(filterPrefix));
            periodTitle = `${currentYear}年${currentMonth}月度 成績`;
        } else if (period === 'today') {
            const today = now.toISOString().split('T')[0];
            filtered = filtered.filter(r => r.date === today);
            periodTitle = `${today} 成績`;
        }

        // Aggregate statistics per player
        const playerStats = {};

        // Initialize statistics for all known players
        state.players.forEach(p => {
            playerStats[p.id] = {
                id: p.id,
                name: p.name,
                totalNet: 0,
                gamesCount: 0,
                rankSum: 0,
                ranks: { 1: 0, 2: 0, 3: 0, 4: 0 },
                yakitoriCount: 0
            };
        });

        // Sum up score results
        filtered.forEach(record => {
            record.results.forEach(res => {
                // In case a player was deleted but records exist
                if (!playerStats[res.playerId]) {
                    playerStats[res.playerId] = {
                        id: res.playerId,
                        name: 'Unknown Player',
                        totalNet: 0,
                        gamesCount: 0,
                        rankSum: 0,
                        ranks: { 1: 0, 2: 0, 3: 0, 4: 0 },
                        yakitoriCount: 0
                    };
                }

                const stats = playerStats[res.playerId];
                stats.totalNet += res.netScore;
                stats.gamesCount++;
                stats.rankSum += res.rank;
                if (stats.ranks[res.rank] !== undefined) {
                    stats.ranks[res.rank]++;
                }
                if (res.yakitori) {
                    stats.yakitoriCount++;
                }
            });
        });

        // Convert statistics mapping into sorted array
        const sortedPlayers = Object.values(playerStats)
            .filter(stats => stats.gamesCount > 0) // Only show players who have played at least 1 game in this period
            .sort((a, b) => b.totalNet - a.totalNet);

        if (sortedPlayers.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 2rem 0;">
                    <i class="fa-solid fa-filter" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>この集計期間での対局記録がありません。</p>
                </div>
            `;
            this.exportTextArea.textContent = `${periodTitle}の対局データがありません。`;
            return;
        }

        // Render Leaderboard Cards
        sortedPlayers.forEach((stats, rankIndex) => {
            const rank = rankIndex + 1;
            const avgRank = (stats.rankSum / stats.gamesCount).toFixed(2);
            const r1Percent = (stats.ranks[1] / stats.gamesCount) * 100;
            const r4Percent = (stats.ranks[4] / stats.gamesCount) * 100;
            const r2Percent = (stats.ranks[2] / stats.gamesCount) * 100;
            const r3Percent = (stats.ranks[3] / stats.gamesCount) * 100;

            // 段位バッジ・称号バッジを取得
            const ratingInfo = state.ratings[stats.id];
            const danInfo = PremiumFeatures.getDanTitle(
                ratingInfo ? ratingInfo.elo : 1500,
                ratingInfo ? ratingInfo.games : 0
            );
            const titleInfo = PremiumFeatures.getTitleBadge(stats, state.gameRecords);

            const card = document.createElement('div');
            card.className = `leaderboard-card rank-${rank <= 3 ? rank : 'other'}`;

            const rankBadge = document.createElement('div');
            rankBadge.className = 'rank-badge';
            rankBadge.textContent = rank;

            const details = document.createElement('div');
            details.className = 'player-details';

            // プレイヤー名 + 段位バッジ
            const nameRow = document.createElement('div');
            nameRow.style.cssText = 'display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.15rem;';
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'font-weight:700; font-size:1.1rem;';
            nameSpan.textContent = stats.name;
            nameRow.appendChild(nameSpan);
            
            // 段位バッジ（Eloデータある場合のみ）
            if (ratingInfo) {
                const danBadge = document.createElement('span');
                if (state.isPremiumUnlocked) {
                    danBadge.className = `badge elo-badge ${danInfo.cssClass}`;
                    danBadge.textContent = danInfo.label;
                    danBadge.title = `Elo: ${ratingInfo.elo} (${ratingInfo.games}戦)`;
                } else {
                    danBadge.className = 'badge elo-badge-locked';
                    danBadge.textContent = '🔒 プレミアム段位';
                    danBadge.title = 'クリックしてプレミアム設定へ';
                    danBadge.addEventListener('click', () => {
                        const tabBtn = document.querySelector('[data-tab="setup"]');
                        if (tabBtn) tabBtn.click();
                        setTimeout(() => {
                            const widget = document.querySelector('.premium-widget');
                            if (widget) widget.scrollIntoView({ behavior: 'smooth' });
                        }, 150);
                    });
                }
                nameRow.appendChild(danBadge);
            }
            
            // 称号バッジ
            const titleBadge = document.createElement('span');
            if (state.isPremiumUnlocked) {
                titleBadge.className = `badge title-badge ${titleInfo.cssClass}`;
                titleBadge.textContent = titleInfo.label;
            } else {
                titleBadge.className = 'badge title-badge-locked';
                titleBadge.textContent = '🔒 プレミアム称号';
                titleBadge.title = 'クリックしてプレミアム設定へ';
                titleBadge.addEventListener('click', () => {
                    const tabBtn = document.querySelector('[data-tab="setup"]');
                    if (tabBtn) tabBtn.click();
                    setTimeout(() => {
                        const widget = document.querySelector('.premium-widget');
                        if (widget) widget.scrollIntoView({ behavior: 'smooth' });
                    }, 150);
                });
            }
            nameRow.appendChild(titleBadge);

            const yakitoriRate = stats.yakitoriCount ? ((stats.yakitoriCount / stats.gamesCount) * 100).toFixed(1) : '0.0';
            const statsRow = document.createElement('div');
            statsRow.className = 'player-stats-row';
            statsRow.innerHTML = `
                <span>対局数: <strong>${stats.gamesCount}</strong> 半荘</span>
                <span>平均順位: <strong>${avgRank}</strong> 位</span>
                <span>1位率: <strong style="color:var(--color-rank-1)">${r1Percent.toFixed(1)}%</strong></span>
                <span>ラス率: <strong style="color:var(--accent-red)">${r4Percent.toFixed(1)}%</strong></span>
                <span>焼き鳥: <strong>${stats.yakitoriCount || 0}</strong> 回</span>
                ${ratingInfo ? `<span>Elo: <strong style="color:var(--accent-gold)">${state.isPremiumUnlocked ? ratingInfo.elo : '🔒'}</strong></span>` : ''}
            `;

            // Visual bar showing ratios of 1st, 2nd, 3rd, 4th place
            const distBar = document.createElement('div');
            distBar.className = 'distribution-bar';

            if (r1Percent > 0) distBar.innerHTML += `<div class="dist-segment dist-1" style="width: ${r1Percent}%" title="1位: ${stats.ranks[1]}回"></div>`;
            if (r2Percent > 0) distBar.innerHTML += `<div class="dist-segment dist-2" style="width: ${r2Percent}%" title="2位: ${stats.ranks[2]}回"></div>`;
            if (r3Percent > 0) distBar.innerHTML += `<div class="dist-segment dist-3" style="width: ${r3Percent}%" title="3位: ${stats.ranks[3]}回"></div>`;
            if (r4Percent > 0) distBar.innerHTML += `<div class="dist-segment dist-4" style="width: ${r4Percent}%" title="4位: ${stats.ranks[4]}回"></div>`;

            const distLegend = document.createElement('div');
            distLegend.className = 'distribution-legend';
            distLegend.innerHTML = `
                <div class="legend-item"><div class="legend-color dist-1"></div> 1位:${stats.ranks[1]}</div>
                <div class="legend-item"><div class="legend-color dist-2"></div> 2位:${stats.ranks[2]}</div>
                <div class="legend-item"><div class="legend-color dist-3"></div> 3位:${stats.ranks[3]}</div>
                ${r4Percent > 0 ? `<div class="legend-item"><div class="legend-color dist-4"></div> 4位:${stats.ranks[4]}</div>` : ''}
            `;

            details.appendChild(nameRow);
            details.appendChild(statsRow);
            details.appendChild(distBar);
            details.appendChild(distLegend);

            const score = document.createElement('div');
            score.className = 'player-total-score ' + (stats.totalNet >= 0 ? 'diff-positive' : 'diff-negative');
            const totalText = stats.totalNet > 0 ? `+${stats.totalNet.toFixed(1)}` : stats.totalNet.toFixed(1);
            score.textContent = totalText;

            card.appendChild(rankBadge);
            card.appendChild(details);
            card.appendChild(score);

            container.appendChild(card);
        });

        // Generate text report to share
        this.generateShareableReport(periodTitle, sortedPlayers);
        // グラフ描画（PremiumFeaturesへ委譲）
        PremiumFeatures.renderCharts(sortedPlayers, state.gameRecords);
    },

    // ==========================================
    // PREMIUM LOCK SYSTEM LOGIC
    // ==========================================
    initPremium() {
        const PREMIUM_HASH = "01ddac116b660a924b4808dad77e15c8e34d302629a3a29b93fbe7f87c9e4011"; // SHA-256 for "mj-premium-2026"
        const NOTE_ARTICLE_URL = "https://note.com/";

        // Helper to hash password
        const sha256 = async (message) => {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const handleUnlock = async (pwdInputEl, errEl) => {
            const password = pwdInputEl.value.trim();
            if (!password) return;

            errEl.textContent = '検証中...';
            const hash = await sha256(password);
            
            if (hash === PREMIUM_HASH) {
                state.isPremiumUnlocked = true;
                Storage.savePremium();
                errEl.textContent = '';
                pwdInputEl.value = '';
                this.updatePremiumUI();
                this.renderStats();
            } else {
                errEl.textContent = 'パスワードが正しくありません。';
                pwdInputEl.classList.add('shake-animation');
                setTimeout(() => {
                    pwdInputEl.classList.remove('shake-animation');
                }, 400);
            }
        };

        // 1. Stats Tab Lock Overlay
        const unlockBtn = document.getElementById('premium-unlock-btn');
        const passwordInput = document.getElementById('premium-password');
        const errorMsg = document.getElementById('premium-error-msg');
        const noteLink = document.getElementById('premium-note-link');

        if (noteLink) {
            noteLink.href = NOTE_ARTICLE_URL;
        }

        if (unlockBtn && passwordInput && errorMsg) {
            unlockBtn.addEventListener('click', () => handleUnlock(passwordInput, errorMsg));
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleUnlock(passwordInput, errorMsg);
            });
        }

        // 2. Setup Tab Widget
        const setupUnlockBtn = document.getElementById('setup-premium-unlock-btn');
        const setupPasswordInput = document.getElementById('setup-premium-password');
        const setupErrorMsg = document.getElementById('setup-premium-error-msg');

        if (setupUnlockBtn && setupPasswordInput && setupErrorMsg) {
            setupUnlockBtn.addEventListener('click', () => handleUnlock(setupPasswordInput, setupErrorMsg));
            setupPasswordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleUnlock(setupPasswordInput, setupErrorMsg);
            });
        }

        // 3. Setup Tab Lock Button (Test tool)
        const setupLockBtn = document.getElementById('setup-premium-lock-btn');
        if (setupLockBtn) {
            setupLockBtn.addEventListener('click', () => {
                if (confirm('プレミアム機能を再びロックしますか？（動作確認用）')) {
                    state.isPremiumUnlocked = false;
                    Storage.savePremium();
                    this.updatePremiumUI();
                    this.renderStats();
                }
            });
        }

        this.updatePremiumUI();
    },

    updatePremiumUI() {
        const isUnlocked = state.isPremiumUnlocked;

        // Stats Tab Lock Overlay
        const lockOverlay = document.getElementById('premium-lock-overlay');
        const lockedContent = document.getElementById('premium-locked-content');
        const chartPanel = document.getElementById('chart-panel');
        
        if (lockOverlay && lockedContent) {
            if (isUnlocked) {
                lockOverlay.style.display = 'none';
                lockedContent.classList.remove('premium-blurred');
                if (chartPanel) chartPanel.classList.remove('premium-locked-container');
            } else {
                lockOverlay.style.display = 'flex';
                lockedContent.classList.add('premium-blurred');
                if (chartPanel) chartPanel.classList.add('premium-locked-container');
            }
        }

        // Setup Tab Widget
        const statusBadge = document.getElementById('setup-premium-status');
        const lockedActions = document.getElementById('setup-premium-locked-actions');
        const unlockedActions = document.getElementById('setup-premium-unlocked-actions');
        const setupErrorMsg = document.getElementById('setup-premium-error-msg');
        const statsErrorMsg = document.getElementById('premium-error-msg');

        if (statusBadge && lockedActions && unlockedActions) {
            if (setupErrorMsg) setupErrorMsg.textContent = '';
            if (statsErrorMsg) statsErrorMsg.textContent = '';
            
            if (isUnlocked) {
                statusBadge.textContent = '有効化済み';
                statusBadge.className = 'premium-status-badge unlocked';
                lockedActions.style.display = 'none';
                unlockedActions.style.display = 'flex';
            } else {
                statusBadge.textContent = '未有効化';
                statusBadge.className = 'premium-status-badge locked';
                lockedActions.style.display = 'flex';
                unlockedActions.style.display = 'none';
            }
        }
    },

    generateShareableReport(title, playersList) {
        let text = `【麻雀成績レポート - ${title}】\n`;
        text += `生成日時: ${new Date().toLocaleString('ja-JP')}\n`;
        text += `------------------------------------\n`;

        playersList.forEach((p, idx) => {
            const rank = idx + 1;
            const avg = (p.rankSum / p.gamesCount).toFixed(2);
            const scoreText = p.totalNet > 0 ? `+${p.totalNet.toFixed(1)}` : p.totalNet.toFixed(1);

            text += `${rank}位: ${p.name.padEnd(8, ' ')} ${scoreText.padStart(8, ' ')} pt (${p.gamesCount}半荘, 平均順位:${avg}位, 焼:${p.yakitoriCount}回)\n`;
            text += `    [1位:${p.ranks[1]}回 / 2位:${p.ranks[2]}回 / 3位:${p.ranks[3]}回${p.ranks[4] !== undefined ? ` / 4位:${p.ranks[4]}回` : ''}]\n`;
        });

        text += `------------------------------------\n`;
        text += `#麻雀スコアボード`;

        this.exportTextArea.textContent = text;
    }
};

// ==========================================
// MAHJONG SCOREBOOK - PREMIUM FEATURES
// ==========================================
const PremiumFeatures = {
    rankHistoryChart: null,
    avgRankBarChart: null,

    init() {
        // Event Listeners for Chart controls
        const slider = document.getElementById('chart-games-slider');
        const valueDisplay = document.getElementById('chart-games-value');
        if (slider) {
            slider.addEventListener('input', () => {
                valueDisplay.textContent = `${slider.value}戦`;
                this.renderRankHistoryChart(this.getFilteredStats().fullHistory);
            });
        }
        
        // Chart Tabs
        document.querySelectorAll('.chart-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.chart-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const targetId = btn.getAttribute('data-chart-tab');
                document.querySelectorAll('.chart-tab-content').forEach(content => {
                    content.style.display = content.id === targetId ? 'block' : 'none';
                    if (content.id === targetId) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                });
            });
        });

        // Share Image button
        const shareBtn = document.getElementById('share-image-btn');
        if(shareBtn) {
            shareBtn.addEventListener('click', () => {
                // TODO: generateShareCard は機能5（シェアカード）で実装予定
                alert('シェア画像機能は準備中です。');
            });
        }
    },
    
    // ==========================================
    // ELO 段位判定
    // ==========================================
    getDanTitle(elo, games) {
        if (games < 5) return { label: '🔰 体験中', cssClass: 'elo-badge' };
        if (elo < 1500) return { label: '一段', cssClass: 'elo-badge' };
        if (elo < 1550) return { label: '二段', cssClass: 'elo-badge' };
        if (elo < 1600) return { label: '三段⭐', cssClass: 'elo-badge elo-badge-3-star' };
        if (elo < 1650) return { label: '四段⭐', cssClass: 'elo-badge elo-badge-4-star' };
        if (elo < 1700) return { label: '五段⭐', cssClass: 'elo-badge elo-badge-4-star' };
        if (elo < 1750) return { label: '六段💎', cssClass: 'elo-badge elo-badge-6-diamond' };
        if (elo < 1800) return { label: '七段💎', cssClass: 'elo-badge elo-badge-6-diamond' };
        if (elo < 1850) return { label: '八段👑', cssClass: 'elo-badge elo-badge-8-crown' };
        return { label: '九段👑🔥', cssClass: 'elo-badge elo-badge-9-crown elo-badge-9-crown-fire' };
    },

    // ==========================================
    // 称号バッジ判定
    // ==========================================
    getTitleBadge(stats, allRecords) {
        const games = stats.gamesCount;
        if (games < 5) return { label: '🔰 体験中', cssClass: 'title-badge-newbie' };

        const r1Rate = stats.ranks[1] / games;
        const r4Rate = (stats.ranks[4] || 0) / games;
        const avgRank = stats.rankSum / games;

        // 直近N戦の履歴を取得（プレイヤーが参加した対局のみ）
        const playerRecords = allRecords
            .filter(r => r.results.some(res => res.playerId === stats.id))
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.gameNumber - b.gameNumber;
            });

        // 🔥 ゾーン突入: 直近3連続1位
        const recent3 = playerRecords.slice(-3);
        if (recent3.length === 3) {
            const all1st = recent3.every(r => {
                const res = r.results.find(x => x.playerId === stats.id);
                return res && res.rank === 1;
            });
            if (all1st) return { label: '🔥 ゾーン突入', cssClass: 'title-badge-fire' };
        }

        // 👑 絶対王者: 1位率 ≥ 50% かつ 10戦以上
        if (games >= 10 && r1Rate >= 0.5) return { label: '👑 絶対王者', cssClass: 'title-badge-king' };

        // 💎 安定の上位: 平均順位 ≤ 2.0 かつ 5戦以上
        if (avgRank <= 2.0) return { label: '💎 安定の上位', cssClass: 'title-badge-stable' };

        // 📈 急上昇中: 直近5戦の平均順位が全体平均より0.5以上良い
        const recent5 = playerRecords.slice(-5);
        if (recent5.length === 5) {
            const recentAvg = recent5.reduce((sum, r) => {
                const res = r.results.find(x => x.playerId === stats.id);
                return sum + (res ? res.rank : 0);
            }, 0) / 5;
            if (avgRank - recentAvg >= 0.5) return { label: '📈 急上昇中', cssClass: 'title-badge-rising' };
        }

        // 😭 ラス常連: ラス率 ≥ 50%
        if (r4Rate >= 0.5) return { label: '😭 ラス常連', cssClass: 'title-badge-slump' };

        // 🃏 いつも通り
        return { label: '🃏 いつも通り', cssClass: 'title-badge-normal' };
    },

    // ==========================================
    // CHART: 順位推移グラフ（折れ線グラフ）
    // ==========================================
    renderRankHistoryChart(allRecords) {
        const canvas = document.getElementById('rank-history-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        const slider = document.getElementById('chart-games-slider');
        const maxGames = slider ? Number(slider.value) : 20;

        // プレイヤーカラーパレット（固定色）
        const playerColors = [
            '#ffd700', // gold
            '#00e676', // green
            '#2979ff', // blue
            '#ff3d00', // red
            '#e040fb', // purple
            '#00bcd4', // cyan
        ];

        // 全記録を日付・ゲーム番号順にソート
        const sorted = [...allRecords].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.gameNumber - b.gameNumber;
        });

        // 直近 maxGames 件を取得
        const recent = sorted.slice(-maxGames);
        if (recent.length === 0) {
            document.getElementById('chart-panel').style.display = 'none';
            return;
        }

        // 登場プレイヤーIDを収集（出現順を保持）
        const playerIdSet = new Set();
        recent.forEach(r => r.results.forEach(res => playerIdSet.add(res.playerId)));
        const playerIds = Array.from(playerIdSet);

        // X軸ラベル（「MM/DD 第N戦」形式）
        const labels = recent.map(r => `${r.date.slice(5)} 第${r.gameNumber}戦`);

        // データセット生成
        const datasets = playerIds.map((pid, colorIndex) => {
            const player = state.players.find(p => p.id === pid) || { name: pid };
            const data = recent.map(r => {
                const res = r.results.find(x => x.playerId === pid);
                return res ? res.rank : null; // 参加していない場合はnull
            });
            const color = playerColors[colorIndex % playerColors.length];
            return {
                label: player.name,
                data: data,
                borderColor: color,
                backgroundColor: color + '33',
                borderWidth: 2.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.3,
                spanGaps: false
            };
        });

        // 既存チャートを破棄してから再描画
        if (this.rankHistoryChart) {
            this.rankHistoryChart.destroy();
            this.rankHistoryChart = null;
        }

        this.rankHistoryChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                scales: {
                    y: {
                        reverse: true,
                        min: 0.5,
                        max: 4.5,
                        ticks: {
                            stepSize: 1,
                            callback: v => `${v}位`,
                            color: '#8c9c96'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: {
                            color: '#8c9c96',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 12
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#e0e6e3', font: { family: 'Outfit', size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw}位`
                        }
                    }
                }
            }
        });
    },

    // ==========================================
    // CHART: 平均順位棒グラフ（横棒）
    // ==========================================
    renderAvgRankBarChart(sortedPlayers) {
        const canvas = document.getElementById('avg-rank-bar-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        // 平均順位の良い順に並べ替え
        const players = [...sortedPlayers].sort((a, b) => {
            const avgA = a.rankSum / a.gamesCount;
            const avgB = b.rankSum / b.gamesCount;
            return avgA - avgB;
        });

        const labels = players.map(p => p.name);
        const data = players.map(p => Math.round((p.rankSum / p.gamesCount) * 100) / 100);

        const barColors = players.map(p => {
            const avg = p.rankSum / p.gamesCount;
            if (avg <= 2.0) return 'rgba(0, 230, 118, 0.7)';
            if (avg <= 2.5) return 'rgba(212, 175, 55, 0.7)';
            if (avg <= 3.0) return 'rgba(255, 152, 0, 0.7)';
            return 'rgba(255, 61, 0, 0.7)';
        });

        if (this.avgRankBarChart) {
            this.avgRankBarChart.destroy();
            this.avgRankBarChart = null;
        }

        this.avgRankBarChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: '平均順位',
                    data,
                    backgroundColor: barColors,
                    borderColor: barColors.map(c => c.replace('0.7', '1')),
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                scales: {
                    x: {
                        min: 1,
                        max: 4,
                        ticks: {
                            stepSize: 0.5,
                            callback: v => `${v}位`,
                            color: '#8c9c96'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#e0e6e3', font: { family: 'Outfit' } },
                        grid: { color: 'rgba(255,255,255,0.03)' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `平均順位: ${ctx.raw.toFixed(2)}位`
                        }
                    }
                }
            }
        });
    },

    // ==========================================
    // グラフ描画エントリポイント（renderStats()から呼ぶ）
    // ==========================================
    renderCharts(sortedPlayers, allRecords) {
        const chartPanel = document.getElementById('chart-panel');
        if (!chartPanel) return;

        if (sortedPlayers.length === 0) {
            chartPanel.style.display = 'none';
            return;
        }

        chartPanel.style.display = 'block';
        this.renderRankHistoryChart(allRecords);
        this.renderAvgRankBarChart(sortedPlayers);
    },
};
// ==========================================
// STARTUP BOOTSTRAP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    Storage.load();
    DOM.init();
    PremiumFeatures.init();
});