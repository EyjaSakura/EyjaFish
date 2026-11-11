# start-stack.ps1 — 启动 QQ bot 全栈（WSL NapCat + dsh web + 面板 + 抖音 watcher），幂等。
# 用法：
#   powershell -ExecutionPolicy Bypass -File D:\DSH\qqbot\start-stack.ps1
#   powershell -ExecutionPolicy Bypass -File D:\DSH\qqbot\start-stack.ps1 -NoBrowser
param([switch]$Boot, [switch]$NoBrowser)

$ErrorActionPreference = 'Continue'
$Root   = 'D:\DSH\qqbot'
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir 'start-stack.log'

function Write-Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
    Write-Host $line
    Add-Content -Path $Log -Value $line -Encoding UTF8
}
function Wait-Port([int]$Port, [int]$Seconds) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}
# [bridge-ready 2026-10-31] 端口在听 ≠ 桥在干活：插件可能十几分钟后才加载。
# 判定标准：日志里出现 bridge module loaded 且日志比进程启动新，同时 6700 已 Established。
$BridgeLog = 'C:\Users\Eyjafjalla\qq-bridge-debug.log'
function Test-BridgeLoaded([int]$FreshMinutes = 10) {
    if (-not (Test-Path $BridgeLog)) { return $false }
    if ((Get-Item $BridgeLog).LastWriteTime -lt (Get-Date).AddMinutes(-$FreshMinutes)) { return $false }
    $tail = Get-Content $BridgeLog -Tail 400 -ErrorAction SilentlyContinue
    if (-not ($tail -match 'bridge module loaded')) { return $false }
    return [bool](Get-NetTCPConnection -LocalPort 6700 -State Established -ErrorAction SilentlyContinue)
}
function Wait-Bridge([int]$Seconds, [datetime]$Since) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Test-Path $BridgeLog) {
            if ((Get-Item $BridgeLog).LastWriteTime -gt $Since) {
                $tail = Get-Content $BridgeLog -Tail 400 -ErrorAction SilentlyContinue
                if (($tail -match 'bridge module loaded') -and (Get-NetTCPConnection -LocalPort 6700 -State Established -ErrorAction SilentlyContinue)) { return $true }
            }
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Log '=== start-stack begin ==='
if ($Boot) { Start-Sleep -Seconds 20 }

# --- 0. 备份清理（只留最近 10 个）---
$BackupDir = Join-Path $Root 'backups'
if (Test-Path $BackupDir) {
    $old = Get-ChildItem $BackupDir -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10
    if ($old) {
        $old | Remove-Item -Force -ErrorAction SilentlyContinue
        Write-Log ("backups pruned: removed " + $old.Count + " old file(s)")
    }
}

# --- 0. WSL 保活 ---
$keeper = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -match 'sleep infinity' }
if (-not $keeper) {
    Write-Log 'starting WSL keeper (wsl sleep infinity)'
    Start-Process -FilePath 'wsl.exe' -ArgumentList '-d','Ubuntu','-e','sleep','infinity' -WindowStyle Hidden
    Start-Sleep -Seconds 2
} else {
    Write-Log "WSL keeper already running (pid $($keeper.ProcessId -join ','))"
}

# --- 1. 唤醒发行版 ---
& wsl.exe -d Ubuntu -e /bin/true 2>&1 | Out-Null
Start-Sleep -Seconds 4

# --- 2. NapCat（启动脚本自带清理与等待）---
$qqProcs = (& wsl.exe -d Ubuntu -e bash -lc "pgrep -fc '[o]pt/QQ/qq --no-sandbox' || true" 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($qqProcs)) { $qqProcs = '0' }
Write-Log "napcat processes: $qqProcs"
if ($qqProcs -eq '0') {
    Write-Log 'napcat not running -> start via screen'
    $out = (& wsl.exe -d Ubuntu -e bash /mnt/d/DSH/qqbot/deploy/start-napcat-screen.sh 2>&1 | Out-String).Trim()
    foreach ($line in ($out -split "`n")) { if ($line.Trim()) { Write-Log ('  ' + $line.Trim()) } }
    Start-Sleep -Seconds 2
}

# --- 3. dsh web ---
if (Get-NetTCPConnection -State Listen -LocalPort 13080 -ErrorAction SilentlyContinue) {
    Write-Log 'dsh web already listening on 13080'
} else {
    $Bin = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
    if (-not (Test-Path $Bin)) {
        $cmd = Get-Command dsh -ErrorAction SilentlyContinue
        if ($cmd) { $Bin = $cmd.Source } else { $Bin = $null }
    }
    if (-not $Bin) {
        Write-Log 'ERROR: dsh binary not found'
    } else {
        Write-Log "starting dsh web with $Bin"
        $webStartedAt = Get-Date
        Start-Process -FilePath 'node.exe' `
            -ArgumentList @("`"$Bin`"", 'web', '--port', '13080', '--no-open') `
            -WorkingDirectory 'C:\Users\Eyjafjalla' `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $LogDir 'dsh-web.out.log') `
            -RedirectStandardError  (Join-Path $LogDir 'dsh-web.err.log')
        if (Wait-Port 13080 35) { Write-Log 'dsh web listening: True' } else { Write-Log 'dsh web listening: False (35s 超时)' }
        # [defer-bridge-wait] 先开 UI，桥就绪检查挪到最后，避免 QQ 未登录时卡住整个启动
    }
}

# --- 4. 权限面板 ---
if (Get-NetTCPConnection -State Listen -LocalPort 8899 -ErrorAction SilentlyContinue) {
    Write-Log 'permission panel already listening on 8899'
} else {
    Write-Log 'starting permission panel'
    Start-Process -FilePath 'node.exe' `
        -ArgumentList (Join-Path $Root 'panel\server.mjs') `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir 'panel.log') `
        -RedirectStandardError  (Join-Path $LogDir 'panel.err.log')
    Write-Log ('permission panel listening: ' + (Wait-Port 8899 15))
}

# --- 5. 抖音私信 watcher ---
$dy = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dm-watch\.mjs' }
if ($dy) {
    Write-Log "douyin watcher already running (pid $($dy.ProcessId -join ','))"
} else {
    Write-Log 'starting douyin watcher'
    Start-Process -FilePath 'node.exe' -ArgumentList 'dm-watch.mjs' -WorkingDirectory (Join-Path $Root 'douyin') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir 'douyin-watch.out.log') -RedirectStandardError (Join-Path $LogDir 'douyin-watch.err.log')
}

# --- 5.5 本地 GPT-SoVITS 语音服务（9880，纯烬艾雅法拉 v4 音色）---
if (Get-NetTCPConnection -State Listen -LocalPort 9880 -ErrorAction SilentlyContinue) {
    Write-Log 'gpt-sovits api already listening on 9880'
} else {
    Write-Log 'starting gpt-sovits api (port 9880)'
    $env:PYTHONIOENCODING = 'utf-8'
    $env:hz = '25hz'
    # [voice-migrate 2026-11-03] 代码共享 D:\DSH\GPT-SoVITS，说话环境与资产在 D:\DSH\voice
    $env:PYTHONPATH = 'D:\DSH\GPT-SoVITS;D:\DSH\GPT-SoVITS\GPT_SoVITS'
    Start-Process -FilePath 'D:\DSH\voice\env\Scripts\python.exe' `
        -ArgumentList 'api_v2.py','-a','127.0.0.1','-p','9880','-c','D:\DSH\voice\configs\chunjin_v4.yaml' `
        -WorkingDirectory 'D:\DSH\GPT-SoVITS' `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir 'gptsv-api.out.log') `
        -RedirectStandardError  (Join-Path $LogDir 'gptsv-api.err.log')
    Start-Sleep -Seconds 20
    Write-Log ('gpt-sovits api listening: ' + [bool](Get-NetTCPConnection -State Listen -LocalPort 9880 -ErrorAction SilentlyContinue))
}

# --- 6. 打开 Edge：NapCat WebUI + 权限面板 ---
if (-not $NoBrowser) {
    $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }
    # [open-ui-only] 只开 NapCat WebUI + 权限面板；DSH 是后台大脑，不显式打开
    $webui = 'http://127.0.0.1:6099/webui?token=904845364df0'
    $panelUrl = 'http://127.0.0.1:8899'
    if (Test-Path $edge) {
        Write-Log 'opening Edge (webui + panel)'
        Start-Process -FilePath $edge -ArgumentList @('--new-window', $webui)
        Start-Sleep -Milliseconds 800
        Start-Process -FilePath $edge -ArgumentList @($panelUrl)
    } else {
        Write-Log 'edge not found, opening default browser'
        Start-Process $webui
        Start-Process $panelUrl
    }
}

# [defer-bridge-wait] UI 已打开，最后再等桥一小会儿并记录状态
if (Wait-Bridge 30 $webStartedAt) { Write-Log 'qq bridge ready: True' } else { Write-Log 'qq bridge ready: False（QQ 可能还没扫码登录）' }

# --- 7. 最终状态 ---
$p6700 = [bool](Get-NetTCPConnection -LocalPort 6700 -EA SilentlyContinue | Where-Object { $_.State -eq 'Established' })
$p13080 = [bool](Get-NetTCPConnection -State Listen -LocalPort 13080 -EA SilentlyContinue)
$p8899 = [bool](Get-NetTCPConnection -State Listen -LocalPort 8899 -EA SilentlyContinue)
$bridgeReady = Test-BridgeLoaded 10
Write-Log ("status: 13080=$p13080 8899=$p8899 qq-connected=$p6700 qq-bridge=$bridgeReady")
if ($p13080 -and -not $bridgeReady) { Write-Log 'WARN: 端口在听但桥没就绪——现在发消息不会有人回，等日志出现 bridge module loaded 再判断' }
Write-Log '=== start-stack done ==='
