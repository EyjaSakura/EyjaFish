# stop-stack.ps1 — 一键释放大肥鱼相关进程（抖音 watcher、面板、dsh web、NapCat、WSL 保活）。
# 用法：双击「关闭大肥鱼」快捷方式，或在终端运行本脚本。
# 注意：停止 dsh web 会同时关掉 Web GUI 会话，属预期行为。
# 每一步都检查结果，最后弹窗明确告诉你是否全部释放成功。

param([switch]$KeepWsl)

$ErrorActionPreference = 'Continue'
$Root   = 'D:\DSH\qqbot'
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir 'stop-stack.log'

function Write-Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
    Write-Host $line
    Add-Content -Path $Log -Value $line -Encoding UTF8
}

Write-Log '=== stop-stack begin ==='

# --- 1. 抖音 watcher ---
$dy = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dm-watch\.mjs' }
if ($dy) {
    $dy | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Log "douyin watcher stopped ($($dy.ProcessId -join ','))"
    Start-Sleep -Seconds 1
} else { Write-Log 'douyin watcher: not running' }

# --- 2. 权限面板 ---
$panel = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'panel[\\/]server\.mjs' }
if (-not $panel) {
    $owner = (Get-NetTCPConnection -State Listen -LocalPort 8899 -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    if ($owner) { $panel = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue }
}
if ($panel) {
    $panel | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Log "permission panel stopped ($($panel.ProcessId -join ','))"
    Start-Sleep -Seconds 1
} else { Write-Log 'permission panel: not running' }

# --- 3. NapCat / QQ（先温柔后强制）---
& wsl.exe -d Ubuntu -e bash -lc "pkill -TERM -f '[o]pt/QQ/qq --no-sandbox' 2>/dev/null; sleep 3; pkill -9 -f '[o]pt/QQ/qq --no-sandbox' 2>/dev/null; screen -wipe >/dev/null 2>&1; true" | Out-Null
$qqLeft = (& wsl.exe -d Ubuntu -e bash -lc "pgrep -fc '[o]pt/QQ/qq --no-sandbox' || true" 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($qqLeft)) { $qqLeft = '0' }
Write-Log "napcat processes after stop: $qqLeft"

# --- 4. dsh web（会关掉当前 GUI，属于预期）---
$dsh = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'bin\.js"?\s+web\s+--port\s+13080' }
if ($dsh) {
    $dsh | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Log "dsh web stopped ($($dsh.ProcessId -join ','))"
    Start-Sleep -Seconds 2
} else { Write-Log 'dsh web: not running' }

# --- 5. WSL 保活 ---
$keeper = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -match 'sleep infinity' }
if ($keeper) {
    $keeper | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Log "WSL keeper stopped ($($keeper.ProcessId -join ','))"
} else { Write-Log 'WSL keeper: not running' }

# --- 6. 验收（先查 QQ，避免 wsl --shutdown 之后又把它叫醒）---
$qqNow = (& wsl.exe -d Ubuntu -e bash -lc "pgrep -fc '[o]pt/QQ/qq --no-sandbox' || true" 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($qqNow)) { $qqNow = '0' }

# --- 7. 关掉 WSL 发行版（可选）---
if (-not $KeepWsl) {
    & wsl.exe --shutdown | Out-Null
    Write-Log 'wsl --shutdown done'
}

Start-Sleep -Seconds 2

# --- 7. 收尾：按端口强杀残留监听者 ---
foreach ($vp in 8899, 13080) {
    $owners = Get-NetTCPConnection -State Listen -LocalPort $vp -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($op in $owners) {
        if ($op) { Stop-Process -Id $op -Force -ErrorAction SilentlyContinue; Write-Log ("port $vp still held by pid $op -> killed") }
    }
}
Start-Sleep -Seconds 1

$ports = 13080, 8899, 6700, 6099
$openPorts = @()
foreach ($p in $ports) {
    if (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) { $openPorts += $p }
}
$npmLeft = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dm-watch\.mjs|panel[\\/]server\.mjs|bin\.js"?\s+web' }).Count

$ok = ($openPorts.Count -eq 0) -and ($npmLeft -eq 0) -and ($qqNow -eq '0')
$detail = @()
$detail += if ($openPorts.Count -eq 0) { '端口：全部已释放' } else { '端口仍占用：' + ($openPorts -join ', ') }
$detail += if ($npmLeft -eq 0) { 'Node 进程：已清理' } else { "Node 进程残留：$npmLeft" }
$detail += if ($qqNow -eq '0') { 'NapCat/QQ：已退出' } else { "NapCat/QQ 残留：$qqNow" }

if ($ok) { Write-Log 'RELEASE_OK' } else { Write-Log 'RELEASE_PARTIAL' }
Write-Log ('RELEASE ' + ($detail -join ' | '))
Write-Log '=== stop-stack done ==='

# --- 8. 弹窗告知 ---
try {
    Add-Type -AssemblyName System.Windows.Forms
    $title = if ($ok) { '释放成功' } else { '释放未完全成功' }
    $icon  = if ($ok) { [System.Windows.Forms.MessageBoxIcon]::Information } else { [System.Windows.Forms.MessageBoxIcon]::Warning }
    $msg = ($(if ($ok) { "大肥鱼已完全停止 ✅`n`n" } else { "仍有残留，请检查 ⚠️`n`n" }) + ($detail -join "`n"))
    [System.Windows.Forms.MessageBox]::Show($msg, $title, [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
} catch {
    Write-Log "messagebox failed: $($_.Exception.Message)"
}
