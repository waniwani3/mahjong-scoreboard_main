// ==========================================
// MAHJONG SCOREBOOK - CORE ENGINE & STATE
// ==========================================

// State Object
const state = {
    groups: [],           // Array of { id, name, createdAt }
    currentGroupId: 'group_default',
    players: [],          // Array of { id, name, groupId }
    gameRecords: [],      // Array of Game Records { id, groupId, date, gameNumber, playerCount, results }
    ratings: {},          // { playerId: { elo: 1500, games: 0 } }
    activePlayers: [],    // Array of IDs currently selected for active match
    activePlayersMap: {}, // { [groupId]: ['p1', 'p2', ...] }
    rules: {
        playerCount: 4,
        startPoints: 25000,
        returnPoints: 30000,
        uma: [10, 5, -5, -10],
        roundingRule: 'rank-floor-ceil', // none, round, goju-chuni, truncate, ceil, rank-ceil-floor, rank-floor-ceil
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
            const groupsData = localStorage.getItem('mj_groups');
            const currentGroupId = localStorage.getItem('mj_current_group_id');
            const playersData = localStorage.getItem('mj_players');
            const recordsData = localStorage.getItem('mj_records');
            const rulesData = localStorage.getItem('mj_rules');
            const activePlayersMapData = localStorage.getItem('mj_active_players_map');

            // 1. グループの読み込みと初期化
            if (groupsData) {
                state.groups = JSON.parse(groupsData);
            }
            if (!state.groups || state.groups.length === 0) {
                state.groups = [
                    { id: 'group_default', name: 'メイン卓', createdAt: Date.now() }
                ];
                this.saveGroups();
            }

            // 現在のグループID
            if (currentGroupId && state.groups.some(g => g.id === currentGroupId)) {
                state.currentGroupId = currentGroupId;
            } else {
                state.currentGroupId = state.groups[0].id;
                this.saveCurrentGroupId();
            }

            // 2. プレイヤーの読み込みとマイグレーション
            if (playersData) {
                state.players = JSON.parse(playersData);
                // 既存プレイヤーにgroupIdがない場合は現在のデフォルトグループに割り当て
                let updated = false;
                state.players.forEach(p => {
                    if (!p.groupId) {
                        p.groupId = state.groups[0].id;
                        updated = true;
                    }
                });
                if (updated) this.savePlayers();
            } else {
                // 初期プレイヤー
                const defaultGid = state.groups[0].id;
                state.players = [
                    { id: 'p1', name: 'プレイヤーA', groupId: defaultGid },
                    { id: 'p2', name: 'プレイヤーB', groupId: defaultGid },
                    { id: 'p3', name: 'プレイヤーC', groupId: defaultGid },
                    { id: 'p4', name: 'プレイヤーD', groupId: defaultGid }
                ];
                this.savePlayers();
            }

            // 3. レコードの読み込みとマイグレーション
            if (recordsData) {
                state.gameRecords = JSON.parse(recordsData);
                let recordsUpdated = false;
                state.gameRecords.forEach(r => {
                    if (!r.groupId) {
                        r.groupId = state.groups[0].id;
                        recordsUpdated = true;
                    }
                });
                if (recordsUpdated) this.saveRecords();
            }

            // 4. ルール読み込み
            if (rulesData) {
                state.rules = JSON.parse(rulesData);
                // 初期状態のデフォルトを「3,4位切り上げ、1,2位切り捨て」に更新
                if (!state.rules.roundingRule || state.rules.roundingRule === 'round') {
                    state.rules.roundingRule = 'rank-floor-ceil';
                    this.saveRules();
                }
            } else {
                state.rules.roundingRule = 'rank-floor-ceil';
                this.saveRules();
            }

            // 5. グループ別選択中プレイヤーの読み込み
            if (activePlayersMapData) {
                state.activePlayersMap = JSON.parse(activePlayersMapData);
            } else {
                state.activePlayersMap = {};
            }

            // 現在のグループのアクティブプレイヤーをセット
            state.activePlayers = state.activePlayersMap[state.currentGroupId] || [];

            // ratingsも初期化時に読み込む
            this.loadRatings();

            // プレミアム有効化状態の読み込み
            state.isPremiumUnlocked = localStorage.getItem('mj_premium_unlocked') === 'true';

        } catch (e) {
            console.error('LocalStorage load failed, resetting state:', e);
        }
    },

    saveGroups() {
        localStorage.setItem('mj_groups', JSON.stringify(state.groups));
    },

    saveCurrentGroupId() {
        localStorage.setItem('mj_current_group_id', state.currentGroupId);
    },

    saveActivePlayersMap() {
        localStorage.setItem('mj_active_players_map', JSON.stringify(state.activePlayersMap));
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

    // Group Management
    groupTabsList: document.getElementById('group-tabs-list'),
    addGroupBtn: document.getElementById('add-group-btn'),
    activeGroupTitle: document.getElementById('active-group-title'),
    renameGroupBtn: document.getElementById('rename-group-btn'),
    deleteGroupBtn: document.getElementById('delete-group-btn'),
    currentGroupBadge: document.getElementById('current-group-badge'),
    gameActiveGroupName: document.getElementById('game-active-group-name'),

    // Player Management
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
    filterGroup: document.getElementById('filter-group'),
    filterYear: document.getElementById('filter-year'),
    filterMonth: document.getElementById('filter-month'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    historyListContainer: document.getElementById('history-list-container'),

    // Stats Panel
    statsGroup: document.getElementById('stats-group'),
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

        // ルール設定の各要素の値を反映
        if (this.ruleType) this.ruleType.value = state.rules.playerCount || 4;
        if (this.startPoints) this.startPoints.value = state.rules.startPoints || 25000;
        if (this.returnPoints) this.returnPoints.value = state.rules.returnPoints || 30000;
        if (this.roundingRule) {
            this.roundingRule.value = state.rules.roundingRule || 'rank-floor-ceil';
        }

        this.setupTabNavigation();
        this.setupEventListeners();
        this.renderGroupTabs();
        this.renderPlayerRoster();
        this.updateUmaPresets();
        this.populateFilterGroups();
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
            if (tabId === 'players') {
                this.renderGroupTabs();
                this.renderPlayerRoster();
            } else if (tabId === 'history') {
                this.populateFilterGroups();
                this.renderHistory();
            } else if (tabId === 'stats') {
                this.populateFilterGroups();
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

        // Group Management Action Listeners
        if (this.addGroupBtn) {
            this.addGroupBtn.addEventListener('click', () => this.createNewGroup());
        }
        if (this.renameGroupBtn) {
            this.renameGroupBtn.addEventListener('click', () => this.renameCurrentGroup());
        }
        if (this.deleteGroupBtn) {
            this.deleteGroupBtn.addEventListener('click', () => this.deleteCurrentGroup());
        }
        if (this.filterGroup) {
            this.filterGroup.addEventListener('change', () => this.renderHistory());
        }
        if (this.statsGroup) {
            this.statsGroup.addEventListener('change', () => this.renderStats());
        }

        // Add Player (Scoped to current group)
        const handleAddPlayer = () => {
            const name = this.newPlayerName.value.trim();
            if (!name) return;

            // Check for duplicates in current group
            if (state.players.some(p => p.groupId === state.currentGroupId && p.name === name)) {
                alert('このグループ内に同じ名前のプレイヤーが既に存在します。');
                return;
            }

            const newPlayer = {
                id: 'p_' + Date.now(),
                name: name,
                groupId: state.currentGroupId
            };
            state.players.push(newPlayer);
            this.newPlayerName.value = '';
            this.renderPlayerRoster();
            this.renderGroupTabs();
            Storage.savePlayers();
        };
        this.addPlayerBtn.addEventListener('click', handleAddPlayer);
        this.newPlayerName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAddPlayer();
        });

        // Start Session Button
        this.startSessionBtn.addEventListener('click', () => {
            // Find active game number for the selected date within this group
            const date = this.gameDate.value;
            const dailyGames = state.gameRecords.filter(r => r.date === date && r.groupId === state.currentGroupId);
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
            const filterMode = this.filterGroup ? this.filterGroup.value : 'current';
            const curGroupObj = state.groups.find(g => g.id === state.currentGroupId);
            const curGroupName = curGroupObj ? curGroupObj.name : '現在のグループ';

            if (filterMode === 'all') {
                if (confirm('【全グループ】のすべての対局履歴を消去しますか？\nこの操作は取り消せません。')) {
                    state.gameRecords = [];
                    Storage.saveRecords();
                    this.renderHistory();
                    this.renderStats();
                }
            } else {
                const targetGid = filterMode === 'current' ? state.currentGroupId : filterMode;
                const gObj = state.groups.find(g => g.id === targetGid);
                const gName = gObj ? gObj.name : curGroupName;

                if (confirm(`グループ「${gName}」の対局履歴のみ消去しますか？\n他のグループの履歴は保持されます。`)) {
                    state.gameRecords = state.gameRecords.filter(r => r.groupId !== targetGid);
                    Storage.saveRecords();
                    this.renderHistory();
                    this.renderStats();
                }
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
                groups: state.groups,
                currentGroupId: state.currentGroupId,
                players: state.players,
                activePlayersMap: state.activePlayersMap,
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
                    if (data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
                        state.groups = data.groups;
                        state.currentGroupId = data.currentGroupId || state.groups[0].id;
                        Storage.saveGroups();
                        Storage.saveCurrentGroupId();
                    }
                    if (data.activePlayersMap) {
                        state.activePlayersMap = data.activePlayersMap;
                        Storage.saveActivePlayersMap();
                    }
                    if (data.players) {
                        state.players = data.players;
                        // groupId補完
                        const fallbackGid = state.groups[0]?.id || 'group_default';
                        state.players.forEach(p => { if (!p.groupId) p.groupId = fallbackGid; });
                        Storage.savePlayers();
                    }
                    if (data.rules) {
                        state.rules = data.rules;
                        Storage.saveRules();
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
                        const fallbackGid = state.groups[0]?.id || 'group_default';
                        state.gameRecords.forEach(r => { if (!r.groupId) r.groupId = fallbackGid; });
                        Storage.saveRecords();
                    }

                    // 復元後のUI同期
                    state.activePlayers = state.activePlayersMap[state.currentGroupId] || [];
                    this.renderGroupTabs();
                    this.renderPlayerRoster();
                    this.populateFilterGroups();
                    this.renderHistory();
                    this.renderStats();
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

    // ==========================================
    // GROUP MANAGEMENT METHODS
    // ==========================================
    renderGroupTabs() {
        if (!this.groupTabsList) return;
        this.groupTabsList.innerHTML = '';

        state.groups.forEach(group => {
            const tab = document.createElement('div');
            const isActive = group.id === state.currentGroupId;
            tab.className = `group-tab-item ${isActive ? 'active' : ''}`;

            // このグループの登録人数をカウント
            const memberCount = state.players.filter(p => p.groupId === group.id).length;

            tab.innerHTML = `
                <i class="fa-solid fa-layer-group"></i>
                <span>${group.name}</span>
                <span class="group-tab-badge">${memberCount}人</span>
            `;

            tab.addEventListener('click', () => {
                if (group.id !== state.currentGroupId) {
                    this.switchGroup(group.id);
                }
            });

            this.groupTabsList.appendChild(tab);
        });

        // 現在のグループ情報バーを更新
        const currentGroup = state.groups.find(g => g.id === state.currentGroupId) || state.groups[0];
        if (currentGroup) {
            if (this.activeGroupTitle) this.activeGroupTitle.textContent = currentGroup.name;
            if (this.currentGroupBadge) this.currentGroupBadge.innerHTML = `<i class="fa-solid fa-tag"></i> ${currentGroup.name}`;
            if (this.gameActiveGroupName) this.gameActiveGroupName.textContent = currentGroup.name;
        }

        // 削除ボタンの可否（1グループのみの場合は無効化/スタイル調整）
        if (this.deleteGroupBtn) {
            const isOnlyOne = state.groups.length <= 1;
            this.deleteGroupBtn.disabled = isOnlyOne;
            this.deleteGroupBtn.style.opacity = isOnlyOne ? '0.4' : '1';
            this.deleteGroupBtn.style.cursor = isOnlyOne ? 'not-allowed' : 'pointer';
        }
    },

    switchGroup(groupId) {
        state.currentGroupId = groupId;
        Storage.saveCurrentGroupId();

        // 選択中プレイヤーをこのグループのものに復元
        state.activePlayers = state.activePlayersMap[groupId] || [];

        this.renderGroupTabs();
        this.renderPlayerRoster();
        this.updatePlayerSelectionSummary();
        this.populateFilterGroups();

        // スコア入力画面、履歴、成績統計が開いていれば再レンダリング
        if (document.getElementById('game')?.classList.contains('active')) {
            this.renderActiveGameScreen();
        }
        if (document.getElementById('history')?.classList.contains('active')) {
            this.renderHistory();
        }
        if (document.getElementById('stats')?.classList.contains('active')) {
            this.renderStats();
        }
    },

    openGroupModal({ title, desc, initialValue = '', onSubmit }) {
        const modal = document.getElementById('group-modal');
        const modalTitle = document.getElementById('group-modal-title');
        const modalDesc = document.getElementById('group-modal-desc');
        const modalInput = document.getElementById('group-modal-input');
        const modalError = document.getElementById('group-modal-error');
        const submitBtn = document.getElementById('group-modal-submit-btn');
        const cancelBtn = document.getElementById('group-modal-cancel-btn');
        const closeBtn = document.getElementById('group-modal-close-btn');

        if (!modal) return;

        modalTitle.innerHTML = `<i class="fa-solid fa-layer-group text-gold"></i> ${title}`;
        modalDesc.textContent = desc;
        modalInput.value = initialValue;
        modalError.style.display = 'none';
        modalError.textContent = '';
        modal.style.display = 'flex';

        setTimeout(() => modalInput.focus(), 50);

        let cleanup;

        const closeModal = () => {
            modal.style.display = 'none';
            if (cleanup) cleanup();
        };

        const handleSubmit = () => {
            const val = modalInput.value.trim();
            if (!val) {
                modalError.textContent = 'グループ名を入力してください。';
                modalError.style.display = 'block';
                return;
            }
            const error = onSubmit(val);
            if (error) {
                modalError.textContent = error;
                modalError.style.display = 'block';
                return;
            }
            closeModal();
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') closeModal();
        };

        const handleOverlayClick = (e) => {
            if (e.target === modal) closeModal();
        };

        cleanup = () => {
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', closeModal);
            closeBtn.removeEventListener('click', closeModal);
            modalInput.removeEventListener('keydown', handleKeyDown);
            modal.removeEventListener('click', handleOverlayClick);
        };

        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        modalInput.addEventListener('keydown', handleKeyDown);
        modal.addEventListener('click', handleOverlayClick);
    },

    createNewGroup() {
        this.openGroupModal({
            title: '新規グループ作成',
            desc: '新しいグループ名を入力してください（例: 金曜麻雀会、サークルA、家族卓など）:',
            initialValue: '',
            onSubmit: (name) => {
                if (state.groups.some(g => g.name === name)) {
                    return '同名のグループが既に存在します。別の名前を入力してください。';
                }
                const newId = 'group_' + Date.now();
                state.groups.push({
                    id: newId,
                    name: name,
                    createdAt: Date.now()
                });
                Storage.saveGroups();
                this.switchGroup(newId);
                return null;
            }
        });
    },

    renameCurrentGroup() {
        const currentGroup = state.groups.find(g => g.id === state.currentGroupId);
        if (!currentGroup) return;

        this.openGroupModal({
            title: 'グループ名の変更',
            desc: `グループ「${currentGroup.name}」の新しい名前を入力してください:`,
            initialValue: currentGroup.name,
            onSubmit: (name) => {
                if (name !== currentGroup.name && state.groups.some(g => g.name === name)) {
                    return '同名のグループが既に存在します。別の名前を入力してください。';
                }
                currentGroup.name = name;
                Storage.saveGroups();
                this.renderGroupTabs();
                this.populateFilterGroups();
                this.renderHistory();
                this.renderStats();
                return null;
            }
        });
    },

    deleteCurrentGroup() {
        if (state.groups.length <= 1) {
            alert('グループは最低1つ必要なため、最後のグループは削除できません。');
            return;
        }

        const currentGroup = state.groups.find(g => g.id === state.currentGroupId);
        if (!currentGroup) return;

        const pCount = state.players.filter(p => p.groupId === currentGroup.id).length;
        const rCount = state.gameRecords.filter(r => r.groupId === currentGroup.id).length;

        const msg = `グループ「${currentGroup.name}」を削除しますか？\n\n【注意】\n・所属プレイヤー (${pCount}名)\n・過去の対局履歴 (${rCount}戦)\nも一緒に削除されます。この操作は取り消せません。`;
        if (!confirm(msg)) return;

        // 削除処理
        const deletedId = currentGroup.id;
        state.groups = state.groups.filter(g => g.id !== deletedId);
        state.players = state.players.filter(p => p.groupId !== deletedId);
        state.gameRecords = state.gameRecords.filter(r => r.groupId !== deletedId);
        delete state.activePlayersMap[deletedId];

        Storage.saveGroups();
        Storage.savePlayers();
        Storage.saveRecords();
        Storage.saveActivePlayersMap();

        // 最初のグループへ切り替え
        this.switchGroup(state.groups[0].id);
    },

    populateFilterGroups() {
        // 対局履歴と成績統計のグループ選択肢を構築
        const currentGroup = state.groups.find(g => g.id === state.currentGroupId) || state.groups[0];

        const buildOptions = (selectElement) => {
            if (!selectElement) return;
            const currentVal = selectElement.value || 'current';

            selectElement.innerHTML = `
                <option value="current">選択中: ${currentGroup ? currentGroup.name : 'グループ'}</option>
                <option value="all">全グループ通算</option>
            `;

            if (state.groups.length > 1) {
                const optGroup = document.createElement('optgroup');
                optGroup.label = '個別グループ指定';
                state.groups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = `🏷️ ${g.name}`;
                    optGroup.appendChild(opt);
                });
                selectElement.appendChild(optGroup);
            }

            // 以前の選択状態をできるだけ保持
            if (Array.from(selectElement.options).some(o => o.value === currentVal)) {
                selectElement.value = currentVal;
            } else {
                selectElement.value = 'current';
            }
        };

        buildOptions(this.filterGroup);
        buildOptions(this.statsGroup);
    },

    renderPlayerRoster() {
        this.playerRoster.innerHTML = '';

        const currentPlayers = state.players.filter(p => p.groupId === state.currentGroupId);

        if (currentPlayers.length === 0) {
            this.playerRoster.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 1.5rem 0; width: 100%;">
                    <i class="fa-solid fa-users" style="font-size: 2.5rem; margin-bottom: 0.5rem; opacity: 0.3;"></i>
                    <p style="font-size: 0.9rem; margin-bottom: 0.25rem;">このグループにはまだプレイヤーが登録されていません。</p>
                    <p style="font-size: 0.8rem; color: #64748b;">上の入力欄からプレイヤー名を入力して追加してください。</p>
                </div>
            `;
            this.updatePlayerSelectionSummary();
            return;
        }

        currentPlayers.forEach(p => {
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
                // グループごとに選択プレイヤーを記憶
                state.activePlayersMap[state.currentGroupId] = [...state.activePlayers];
                Storage.saveActivePlayersMap();
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
            deleteBtn.title = 'プレイヤーを削除';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`本当にプレイヤー「${p.name}」を削除しますか？\n過去の対局履歴のスコアは削除されません。`)) {
                    state.players = state.players.filter(item => item.id !== p.id);
                    state.activePlayers = state.activePlayers.filter(id => id !== p.id);
                    state.activePlayersMap[state.currentGroupId] = [...state.activePlayers];
                    Storage.saveActivePlayersMap();
                    Storage.savePlayers();
                    this.renderPlayerRoster();
                    this.renderGroupTabs();
                    this.updatePlayerSelectionSummary();
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
        const currentGroup = state.groups.find(g => g.id === state.currentGroupId) || state.groups[0] || { name: 'グループ' };
        if (this.gameActiveGroupName) {
            this.gameActiveGroupName.textContent = currentGroup.name;
        }

        if (state.activePlayers.length !== required) {
            this.scoreEntriesContainer.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 2rem 0;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 1rem; color: var(--accent-gold);"></i>
                    <p>グループ「<strong>${currentGroup.name}</strong>」の対局プレイヤー選択が不十分です。</p>
                    <p style="font-size: 0.85rem; margin-top: 0.5rem; color: #94a3b8;">「プレイヤー・グループ」タブから ${required} 名のプレイヤーを選択してください。</p>
                </div>
            `;
            this.saveRoundBtn.disabled = true;
            this.autofillBtn.disabled = true;
            return;
        }

        this.saveRoundBtn.disabled = false;
        this.autofillBtn.disabled = false;

        const date = this.gameDate.value;
        const dailyGames = state.gameRecords.filter(r => r.date === date && r.groupId === state.currentGroupId);
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
        const dailyGames = state.gameRecords.filter(r => r.date === date && r.groupId === state.currentGroupId);
        const gameNumber = dailyGames.length + 1;

        const record = {
            id: 'game_' + Date.now(),
            groupId: state.currentGroupId,
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

        const newDailyGames = state.gameRecords.filter(r => r.date === date && r.groupId === state.currentGroupId);
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

    calculateEloRatingsForRecords(records) {
        // 時系列順にソート（古い対局から順にシミュレート）
        const fourPlayerRecords = records
            .filter(r => Number(r.playerCount) === 4)
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (a.gameNumber || 0) - (b.gameNumber || 0);
            });

        const calculatedRatings = {};

        const getKFactor = (games) => {
            if (games < 10) return 40;
            if (games < 30) return 24;
            return 16;
        };

        fourPlayerRecords.forEach(record => {
            const results = record.results;
            results.forEach(res => {
                if (!calculatedRatings[res.playerId]) {
                    calculatedRatings[res.playerId] = { elo: 1500, games: 0 };
                }
            });

            const eloDeltas = {};
            results.forEach(res => { eloDeltas[res.playerId] = 0; });

            for (let i = 0; i < results.length; i++) {
                for (let j = i + 1; j < results.length; j++) {
                    const piId = results[i].playerId;
                    const pjId = results[j].playerId;

                    const eloI = calculatedRatings[piId].elo;
                    const eloJ = calculatedRatings[pjId].elo;
                    const gamesI = calculatedRatings[piId].games;
                    const gamesJ = calculatedRatings[pjId].games;

                    const kI = getKFactor(gamesI);
                    const kJ = getKFactor(gamesJ);

                    const expectedI = 1 / (1 + Math.pow(10, (eloJ - eloI) / 400));
                    const expectedJ = 1 - expectedI;

                    let actualI, actualJ;
                    if (results[i].rank < results[j].rank) {
                        actualI = 1; actualJ = 0;
                    } else if (results[i].rank > results[j].rank) {
                        actualI = 0; actualJ = 1;
                    } else {
                        actualI = 0.5; actualJ = 0.5;
                    }

                    eloDeltas[piId] += kI * (actualI - expectedI);
                    eloDeltas[pjId] += kJ * (actualJ - expectedJ);
                }
            }

            results.forEach(res => {
                const id = res.playerId;
                calculatedRatings[id].elo = Math.round((calculatedRatings[id].elo + eloDeltas[id]) * 10) / 10;
                calculatedRatings[id].games += 1;
            });
        });

        return calculatedRatings;
    },

    renderHistory() {
        const container = this.historyListContainer;
        container.innerHTML = '';

        if (state.gameRecords.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #8c9c96; padding: 2rem 0;">
                    <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>対局データがありません。「プレイヤー・グループ」からプレイヤーを選んでスコアを入力してください。</p>
                </div>
            `;
            return;
        }

        // Apply group filter
        let filterGroupVal = this.filterGroup ? this.filterGroup.value : 'current';
        if (filterGroupVal === 'current') {
            filterGroupVal = state.currentGroupId;
        }

        let filteredRecords = [...state.gameRecords];
        if (filterGroupVal !== 'all') {
            filteredRecords = filteredRecords.filter(r => r.groupId === filterGroupVal);
        }

        // Get unique years and months for filter dropdowns (based on group-filtered records)
        const years = new Set();
        const months = new Set();

        filteredRecords.forEach(r => {
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

        // Apply year/month filters to records
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
                    <p>指定されたフィルターに一致する対局データはありません。</p>
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

                const groupObj = state.groups.find(g => g.id === game.groupId);
                const groupName = groupObj ? groupObj.name : 'メイン卓';

                const num = document.createElement('div');
                num.className = 'round-number';
                num.innerHTML = `第${game.gameNumber}戦 <span class="history-group-tag">${groupName}</span>`;

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

        // Apply group filter
        let statsGroupVal = this.statsGroup ? this.statsGroup.value : 'current';
        if (statsGroupVal === 'current') {
            statsGroupVal = state.currentGroupId;
        }

        let groupRecords = (statsGroupVal === 'all')
            ? [...state.gameRecords]
            : state.gameRecords.filter(r => r.groupId === statsGroupVal);

        const currentGroupObj = state.groups.find(g => g.id === statsGroupVal);
        const groupLabel = statsGroupVal === 'all' ? '全グループ合算' : (currentGroupObj ? currentGroupObj.name : 'グループ');

        // Apply selected period filter
        const period = this.statsPeriod.value;
        const now = new Date();
        const currentYear = now.getFullYear().toString();
        const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
        const filterPrefix = currentYear + '-' + currentMonth;

        let filtered = [...groupRecords];
        let periodTitle = `【${groupLabel}】通算成績`;

        if (period === 'year') {
            filtered = filtered.filter(r => r.date.startsWith(currentYear));
            periodTitle = `【${groupLabel}】${currentYear}年度 成績`;
        } else if (period === 'month') {
            filtered = filtered.filter(r => r.date.startsWith(filterPrefix));
            periodTitle = `【${groupLabel}】${currentYear}年${currentMonth}月度 成績`;
        } else if (period === 'today') {
            const today = now.toISOString().split('T')[0];
            filtered = filtered.filter(r => r.date === today);
            periodTitle = `【${groupLabel}】${today} 成績`;
        }

        // Aggregate statistics per player
        const playerStats = {};

        // 対象グループに所属するプレイヤー（全グループ合算時は全プレイヤー）で初期化
        const candidatePlayers = (statsGroupVal === 'all')
            ? state.players
            : state.players.filter(p => p.groupId === statsGroupVal);

        candidatePlayers.forEach(p => {
            playerStats[p.id] = {
                id: p.id,
                name: p.name,
                totalNet: 0,
                gamesCount: 0,
                rankSum: 0,
                ranks: { 1: 0, 2: 0, 3: 0, 4: 0 },
                yakitoriCount: 0,
                tobiCount: 0
            };
        });

        // Sum up score results
        filtered.forEach(record => {
            record.results.forEach(res => {
                // In case a player was deleted or belongs to other group but has records
                if (!playerStats[res.playerId]) {
                    const foundP = state.players.find(p => p.id === res.playerId);
                    playerStats[res.playerId] = {
                        id: res.playerId,
                        name: foundP ? foundP.name : 'Unknown Player',
                        totalNet: 0,
                        gamesCount: 0,
                        rankSum: 0,
                        ranks: { 1: 0, 2: 0, 3: 0, 4: 0 },
                        yakitoriCount: 0,
                        tobiCount: 0
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
                if (res.rawScore < 0) {
                    stats.tobiCount++;
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
                    <p>${groupLabel}における指定期間の対局記録がありません。</p>
                </div>
            `;
            this.exportTextArea.textContent = `${periodTitle}の対局データがありません。`;
            PremiumFeatures.renderCharts([], []);
            return;
        }

        // このグループ（または全グループ通算）の4人打ち対局データに基づいて動的Eloレーティングを算出
        const dynamicRatings = this.calculateEloRatingsForRecords(groupRecords);

        // Render Leaderboard Cards
        sortedPlayers.forEach((stats, rankIndex) => {
            const rank = rankIndex + 1;
            const avgRank = (stats.rankSum / stats.gamesCount).toFixed(2);
            const r1Percent = (stats.ranks[1] / stats.gamesCount) * 100;
            const r4Percent = (stats.ranks[4] / stats.gamesCount) * 100;
            const r2Percent = (stats.ranks[2] / stats.gamesCount) * 100;
            const r3Percent = (stats.ranks[3] / stats.gamesCount) * 100;

            // 段位バッジ・称号バッジを取得（対象グループの対局母集団に基づく）
            const ratingInfo = dynamicRatings[stats.id] || state.ratings[stats.id];
            const danInfo = PremiumFeatures.getDanTitle(
                ratingInfo ? ratingInfo.elo : 1500,
                ratingInfo ? ratingInfo.games : 0
            );
            const titleInfo = PremiumFeatures.getTitleBadge(stats, groupRecords);

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
            const tobiRate = stats.tobiCount ? ((stats.tobiCount / stats.gamesCount) * 100).toFixed(1) : '0.0';
            const statsRow = document.createElement('div');
            statsRow.className = 'player-stats-row';
            statsRow.innerHTML = `
                <span>対局数: <strong>${stats.gamesCount}</strong> 半荘</span>
                <span>平均順位: <strong>${avgRank}</strong> 位</span>
                <span>1位率: <strong style="color:var(--color-rank-1)">${r1Percent.toFixed(1)}%</strong></span>
                <span>2位率: <strong style="color:var(--color-rank-2)">${state.isPremiumUnlocked ? r2Percent.toFixed(1) + '%' : '🔒'}</strong></span>
                <span>3位率: <strong style="color:var(--color-rank-3)">${state.isPremiumUnlocked ? r3Percent.toFixed(1) + '%' : '🔒'}</strong></span>
                <span>ラス率: <strong style="color:var(--accent-red)">${r4Percent.toFixed(1)}%</strong></span>
                <span>焼き鳥率: <strong>${state.isPremiumUnlocked ? yakitoriRate + '%' : '🔒'}</strong> ${state.isPremiumUnlocked ? `(<strong>${stats.yakitoriCount || 0}</strong>回)` : ''}</span>
                <span>飛び率: <strong>${state.isPremiumUnlocked ? tobiRate + '%' : '🔒'}</strong> ${state.isPremiumUnlocked ? `(<strong>${stats.tobiCount || 0}</strong>回)` : ''}</span>
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
        PremiumFeatures.renderCharts(sortedPlayers, filtered);
    },

    // ==========================================
    // PREMIUM LOCK SYSTEM LOGIC
    // ==========================================
    initPremium() {
        // パスワード照合（file:// でも動作するシンプルな方式）
        const PREMIUM_ENCODED = btoa('mj-premium-2026'); // "bWotcHJlbWl1bS0yMDI2"
        const NOTE_ARTICLE_URL = "https://note.com/_waniwani3/n/nbb6c554f7ff0";

        // パスワード入力の正規化（全角英数・全角ハイフン・長音・余分な空白・大文字小文字を吸収）
        const normalizePassword = (input) => {
            if (!input) return '';
            return String(input)
                .trim()
                .replace(/[\s\u3000]+/g, '') // 全角・半角スペース除去
                .replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角英数→半角
                .replace(/[ーｰ－‐―–—]/g, '-') // 全角ハイフン・長音→半角ハイフン
                .toLowerCase();
        };

        const handleUnlock = (pwdInputEl, errEl) => {
            const raw = pwdInputEl.value;
            const normalized = normalizePassword(raw);
            if (!normalized) {
                errEl.style.color = 'var(--accent-red)';
                errEl.textContent = 'パスワードを入力してください。';
                pwdInputEl.focus();
                return;
            }

            errEl.style.color = 'var(--text-secondary)';
            errEl.textContent = '検証中...';

            // btoa による照合（全環境で動作）
            let encoded = '';
            try {
                encoded = btoa(normalized);
            } catch(e) {
                encoded = '';
            }

            const isMatch = (encoded === PREMIUM_ENCODED);

            if (isMatch) {
                state.isPremiumUnlocked = true;
                Storage.savePremium();
                errEl.style.color = 'var(--accent-green)';
                errEl.textContent = '✨ プレミアム機能を有効化しました！';
                pwdInputEl.value = '';
                setTimeout(() => {
                    this.updatePremiumUI();
                    this.renderStats();
                }, 400);
            } else {
                errEl.style.color = 'var(--accent-red)';
                errEl.textContent = 'パスワードが正しくありません。';
                pwdInputEl.classList.add('shake-animation');
                setTimeout(() => {
                    pwdInputEl.classList.remove('shake-animation');
                }, 400);
            }
        };

        // パスワード表示/非表示（目のアイコン）トグル
        document.querySelectorAll('.premium-pwd-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = btn.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (!input) return;
                const isNowPassword = (input.type === 'password');
                input.type = isNowPassword ? 'text' : 'password';
                const icon = btn.querySelector('i');
                if (icon) {
                    if (isNowPassword) {
                        icon.className = 'fa-solid fa-eye-slash';
                    } else {
                        icon.className = 'fa-solid fa-eye';
                    }
                }
                input.focus();
            });
        });


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
    currentRecords: [], // フィルタリングされた現在表示対象の対局データ

    init() {
        // Event Listeners for Chart controls
        const slider = document.getElementById('chart-games-slider');
        const valueDisplay = document.getElementById('chart-games-value');
        if (slider) {
            slider.addEventListener('input', () => {
                valueDisplay.textContent = `${slider.value}戦`;
                this.renderRankHistoryChart(this.currentRecords || state.gameRecords);
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
        if (shareBtn) {
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

    focusedPlayerId: 'all', // 'all' または 特定の playerId

    // ==========================================
    // CHART: 順位推移グラフ（折れ線グラフ）
    // ==========================================
    renderRankHistoryChart(allRecords) {
        const canvas = document.getElementById('rank-history-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        const slider = document.getElementById('chart-games-slider');
        const maxGames = slider ? Number(slider.value) : 20;

        // プレイヤーカラーパレット（ダークテーマに映える高識別度カラー）
        const playerColors = [
            '#ffd700', // Gold
            '#00e5ff', // Cyan
            '#ff5252', // Coral Red
            '#00e676', // Emerald
            '#b388ff', // Lavender
            '#ff9100', // Amber
            '#ff4081', // Rose Pink
            '#64ffda', // Teal
        ];

        // 全記録を日付・ゲーム番号順にソート
        const sorted = [...allRecords].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.gameNumber - b.gameNumber;
        });

        // 直近 maxGames 件を取得
        const recent = sorted.slice(-maxGames);
        if (recent.length === 0) {
            const panel = document.getElementById('chart-panel');
            if (panel) panel.style.display = 'none';
            return;
        }

        // 登場プレイヤーIDを収集（出現順を保持）
        const playerIdSet = new Set();
        let maxRankObserved = 3;
        recent.forEach(r => {
            r.results.forEach(res => {
                playerIdSet.add(res.playerId);
                if (res.rank > maxRankObserved) maxRankObserved = res.rank;
            });
        });
        const playerIds = Array.from(playerIdSet);

        // 現在の対局集合にフォーカスプレイヤーが存在しない場合は 'all' にリセット
        if (this.focusedPlayerId !== 'all' && !playerIds.includes(this.focusedPlayerId)) {
            this.focusedPlayerId = 'all';
        }

        // 最大順位（3人打ちなら3、4人打ちなら4）
        const maxRank = Math.max(maxRankObserved, state.rules?.playerCount || 4);

        // 注目プレイヤー選択バーの描画・更新
        this.renderChartPlayerFilter(playerIds, playerColors, allRecords);

        // X軸ラベル（短縮形式: "10/30 #1" や "第N戦"）
        const labels = recent.map(r => {
            const shortDate = r.date.split('-').slice(1).join('/');
            return `${shortDate} #${r.gameNumber}`;
        });

        // データセット生成
        const isHighlightMode = this.focusedPlayerId && this.focusedPlayerId !== 'all';

        const datasets = playerIds.map((pid, colorIndex) => {
            const player = state.players.find(p => p.id === pid) || { name: pid };
            const data = recent.map(r => {
                const res = r.results.find(x => x.playerId === pid);
                return res ? res.rank : null; // 参加していない場合はnull
            });

            const color = playerColors[colorIndex % playerColors.length];
            const isTarget = this.focusedPlayerId === pid;

            if (isHighlightMode) {
                if (isTarget) {
                    // 選択された注目プレイヤー（太く鮮明に強調、最前面へ）
                    return {
                        label: player.name,
                        data: data,
                        borderColor: color,
                        backgroundColor: color + '2a',
                        borderWidth: 4,
                        pointRadius: 6,
                        pointHoverRadius: 9,
                        pointBackgroundColor: color,
                        pointBorderColor: '#0a1612',
                        pointBorderWidth: 2.5,
                        tension: 0.1,
                        spanGaps: true,
                        order: -10,
                        borderDash: []
                    };
                } else {
                    // 非選択のプレイヤー（半透明＆控えめな点線で背景化）
                    return {
                        label: player.name,
                        data: data,
                        borderColor: 'rgba(160, 185, 175, 0.22)',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        pointBackgroundColor: 'rgba(160, 185, 175, 0.4)',
                        pointBorderColor: 'transparent',
                        pointBorderWidth: 0,
                        tension: 0.1,
                        spanGaps: true,
                        order: 10,
                        borderDash: [4, 4]
                    };
                }
            } else {
                // 全員通常表示モード
                return {
                    label: player.name,
                    data: data,
                    borderColor: color,
                    backgroundColor: color + '1a',
                    borderWidth: 2.8,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: color,
                    pointBorderColor: '#0c1a14',
                    pointBorderWidth: 2,
                    tension: 0.1,
                    spanGaps: true,
                    order: colorIndex,
                    borderDash: []
                };
            }
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
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                layout: {
                    padding: {
                        top: 10,
                        bottom: 5,
                        left: 5,
                        right: 15
                    }
                },
                scales: {
                    y: {
                        reverse: true,
                        min: 0.75,
                        max: maxRank + 0.25,
                        ticks: {
                            stepSize: 1,
                            callback: function(v) {
                                if (v === 1) return '🥇 1位 (トップ)';
                                if (v === 2) return '🥈 2位';
                                if (v === 3) return maxRank === 3 ? '💀 3位 (ラス)' : '🥉 3位';
                                if (v === 4) return '💀 4位 (ラス)';
                                return '';
                            },
                            color: function(ctx) {
                                if (ctx.tick.value === 1) return '#ffd700'; // トップはゴールド
                                if (ctx.tick.value === maxRank) return '#ff7675'; // ラスは淡い赤
                                return '#a0b3a8';
                            },
                            font: {
                                family: 'Outfit, sans-serif',
                                size: 11.5,
                                weight: '600'
                            },
                            padding: 8
                        },
                        grid: {
                            color: function(ctx) {
                                if (ctx.tick.value === 1) return 'rgba(212, 175, 55, 0.4)'; // 1位ライン強調
                                if (ctx.tick.value === maxRank) return 'rgba(255, 82, 82, 0.3)'; // ラスライン強調
                                if (ctx.tick.value >= 1 && ctx.tick.value <= maxRank) return 'rgba(255, 255, 255, 0.08)';
                                return 'transparent';
                            },
                            lineWidth: function(ctx) {
                                if (ctx.tick.value === 1 || ctx.tick.value === maxRank) return 1.5;
                                return 1;
                            }
                        }
                    },
                    x: {
                        ticks: {
                            color: '#8c9c96',
                            maxRotation: 35,
                            minRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 12,
                            font: {
                                family: 'Outfit, sans-serif',
                                size: 10.5
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.04)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#e0e6e3',
                            font: { family: 'Outfit, sans-serif', size: 11 },
                            boxWidth: 14,
                            boxHeight: 14,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 12
                        },
                        onClick: (e, legendItem, legend) => {
                            // 凡例クリックで対象プレイヤーの強調をトグル
                            const index = legendItem.datasetIndex;
                            const pid = playerIds[index];
                            if (this.focusedPlayerId === pid) {
                                this.focusedPlayerId = 'all';
                            } else {
                                this.focusedPlayerId = pid;
                            }
                            this.renderRankHistoryChart(allRecords);
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 22, 17, 0.94)',
                        titleColor: '#ffd700',
                        titleFont: { family: 'Outfit, sans-serif', size: 12, weight: 'bold' },
                        bodyColor: '#e0e6e3',
                        bodyFont: { family: 'Outfit, sans-serif', size: 12 },
                        borderColor: 'rgba(212, 175, 55, 0.35)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        boxPadding: 4,
                        callbacks: {
                            title: function(items) {
                                if (!items.length) return '';
                                const index = items[0].dataIndex;
                                const rec = recent[index];
                                return `${rec.date.replace(/-/g, '/')} 第${rec.gameNumber}戦`;
                            },
                            label: function(ctx) {
                                const pid = playerIds[ctx.datasetIndex];
                                const rec = recent[ctx.dataIndex];
                                const res = rec ? rec.results.find(x => x.playerId === pid) : null;
                                if (!res) return null;

                                const rankMedal = res.rank === 1 ? '🥇' : res.rank === 2 ? '🥈' : res.rank === 3 ? '🥉' : '💀';
                                const scoreSign = res.score >= 0 ? `+${res.score.toFixed(1)}` : res.score.toFixed(1);
                                const rawText = res.rawPoints != null ? ` (${res.rawPoints.toLocaleString()}点)` : '';
                                return ` ${rankMedal} ${ctx.dataset.label}: ${res.rank}位 [${scoreSign}pt]${rawText}`;
                            }
                        }
                    }
                }
            }
        });
    },

    // 注目プレイヤー切り替えボタンバーの生成
    renderChartPlayerFilter(playerIds, playerColors, allRecords) {
        const container = document.getElementById('rank-chart-filter-bar');
        if (!container) return;

        let html = `
            <button class="chart-filter-pill ${this.focusedPlayerId === 'all' ? 'active' : ''}" data-player-id="all">
                <i class="fa-solid fa-users"></i> 全員表示
            </button>
        `;

        playerIds.forEach((pid, index) => {
            const player = state.players.find(p => p.id === pid) || { name: pid };
            const color = playerColors[index % playerColors.length];
            const isActive = this.focusedPlayerId === pid;
            html += `
                <button class="chart-filter-pill ${isActive ? 'active' : ''}" data-player-id="${pid}">
                    <span class="pill-dot" style="background-color: ${color}; ${isActive ? 'box-shadow: 0 0 6px ' + color : ''}"></span>
                    <span>${DOM.escapeHtml(player.name)}</span>
                </button>
            `;
        });

        container.innerHTML = html;

        // イベントリスナーの付与
        container.querySelectorAll('.chart-filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const pid = btn.getAttribute('data-player-id');
                if (this.focusedPlayerId === pid && pid !== 'all') {
                    this.focusedPlayerId = 'all'; // 再度クリックで解除
                } else {
                    this.focusedPlayerId = pid;
                }
                this.renderRankHistoryChart(allRecords);
            });
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
        this.currentRecords = allRecords; // 現在の集計期間のデータを保持
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