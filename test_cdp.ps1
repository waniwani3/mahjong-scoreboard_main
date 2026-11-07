$proc = Start-Process -FilePath "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--headless", "--remote-debugging-port=9222", "file:///c:/Projects/mahjong-scoreboard_main/index.html" -PassThru
Start-Sleep -Seconds 2

try {
    $tabs = Invoke-RestMethod -Uri "http://localhost:9222/json"
    $targetTab = $tabs | Where-Object { $_.url -like "*index.html*" } | Select-Object -First 1
    
    $wsUri = [System.Uri]$targetTab.webSocketDebuggerUrl
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource
    $ws.ConnectAsync($wsUri, $cts.Token).Wait(5000)

    function Send-CDP($id, $method, $params) {
        $msgObj = @{ id = $id; method = $method; params = $params }
        $json = $msgObj | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $segment = [System.ArraySegment[byte]]::new($bytes)
        $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait()
    }

    function Read-CDP() {
        $buf = [byte[]]::new(65536)
        $segment = [System.ArraySegment[byte]]::new($buf)
        $res = $ws.ReceiveAsync($segment, [System.Threading.CancellationToken]::None)
        $res.Wait(5000)
        return [System.Text.Encoding]::UTF8.GetString($buf, 0, $res.Result.Count)
    }

    Send-CDP 1 "Runtime.enable" @{}
    Start-Sleep -Milliseconds 200

    $code = @"
    (function() {
        // Create 2 test game records
        const p1 = state.players[0].id;
        const p2 = state.players[1].id;
        const p3 = state.players[2].id;
        const p4 = state.players[3].id;
        
        state.gameRecords = [
            {
                id: 'rec_1',
                groupId: state.currentGroupId,
                date: '2026-11-01',
                gameNumber: 1,
                results: [
                    { playerId: p1, rawPoints: 35000, score: 45, rank: 1 },
                    { playerId: p2, rawPoints: 28000, score: 8, rank: 2 },
                    { playerId: p3, rawPoints: 22000, score: -18, rank: 3 },
                    { playerId: p4, rawPoints: 15000, score: -35, rank: 4 }
                ]
            },
            {
                id: 'rec_2',
                groupId: state.currentGroupId,
                date: '2026-11-01',
                gameNumber: 2,
                results: [
                    { playerId: p2, rawPoints: 40000, score: 50, rank: 1 },
                    { playerId: p1, rawPoints: 25000, score: 5, rank: 2 },
                    { playerId: p4, rawPoints: 20000, score: -20, rank: 3 },
                    { playerId: p3, rawPoints: 15000, score: -35, rank: 4 }
                ]
            }
        ];
        
        DOM.renderStats();

        const res = {};
        const chartPanel = document.getElementById('chart-panel');
        res.chartPanel_display = chartPanel ? window.getComputedStyle(chartPanel).display : null;
        
        // Tab buttons
        const tabs = document.querySelectorAll('.chart-tabs .tab-btn');
        res.tab0_text = tabs[0] ? tabs[0].textContent : null;
        res.tab0_active = tabs[0] ? tabs[0].classList.contains('active') : null;
        res.tab1_text = tabs[1] ? tabs[1].textContent : null;
        res.tab1_active = tabs[1] ? tabs[1].classList.contains('active') : null;
        
        res.rankHistory_display = window.getComputedStyle(document.getElementById('rank-chart-container')).display;
        res.avgRank_display_before = window.getComputedStyle(document.getElementById('avg-rank-chart-container')).display;
        
        // Click tab 1 ('平均順位')
        tabs[1].click();
        
        res.tab0_active_after = tabs[0].classList.contains('active');
        res.tab1_active_after = tabs[1].classList.contains('active');
        res.rankHistory_display_after = window.getComputedStyle(document.getElementById('rank-chart-container')).display;
        res.avgRank_display_after = window.getComputedStyle(document.getElementById('avg-rank-chart-container')).display;
        
        const avgCanvas = document.getElementById('avg-rank-bar-chart');
        res.avgCanvas_w = avgCanvas.offsetWidth;
        res.avgCanvas_h = avgCanvas.offsetHeight;
        res.avgChart_inst = !!PremiumFeatures.avgRankBarChart;
        if (PremiumFeatures.avgRankBarChart) {
            res.avgChart_w = PremiumFeatures.avgRankBarChart.width;
            res.avgChart_h = PremiumFeatures.avgRankBarChart.height;
        }

        return JSON.stringify(res);
    })()
"@
    Send-CDP 2 "Runtime.evaluate" @{ expression = $code; returnByValue = $true }
    Start-Sleep -Milliseconds 500

    for ($i = 0; $i -lt 5; $i++) {
        $resp = Read-CDP
        if ($resp -like '*"id":2*') { 
            Write-Output "RESULT: $resp"
            break 
        }
    }

} catch {
    Write-Output "Error: $_"
} finally {
    if ($ws) { $ws.Dispose() }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
