param([int]$WaitSeconds = 20)

# 由 Windows 任务计划程序调用，不在 dsh web 的进程树里。
# 作用：等当前回合把消息发出去 -> 停 web -> 拉起 start-stack -> 自己轮询到就绪 -> 退出。
#
# [坑 2026-11-01] 两个写法都会把任务卡死在 Running：
#   1) & powershell ... | Out-String   —— start-stack 拉起的常驻子进程继承管道写端，等不到 EOF
#   2) Start-Process ... -Wait         —— -Wait 会连整棵子进程树一起等，常驻进程不退出就等不完
# 所以现在：不 -Wait、不抓输出，只发一个独立进程出去，靠轮询端口判断成败，且轮询有硬上限。
$ErrorActionPreference = 'Continue'
$Root   = 'D:\DSH\qqbot'
$LogDir = Join-Path $Root 'logs'
$log    = Join-Path $LogDir 'web-restart.log'
function LogMsg($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File $log -Append -Encoding utf8 }

LogMsg "=== task fired, waiting ${WaitSeconds}s for the turn to finish ==="
Start-Sleep -Seconds $WaitSeconds

$stopped = @()
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'web --port 13080' } | ForEach-Object {
  $stopped += $_.ProcessId
  LogMsg "stop web pid=$($_.ProcessId)"
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($stopped.Count -eq 0) { LogMsg 'no web process matched, will just start' }
Start-Sleep -Seconds 4

$listen = Get-NetTCPConnection -State Listen -LocalPort 13080 -ErrorAction SilentlyContinue
LogMsg "port 13080 after stop: $([bool]$listen)"

$stack    = Join-Path $Root 'start-stack.ps1'
$stackOut = Join-Path $LogDir 'restart-stack.out.log'
$stackErr = Join-Path $LogDir 'restart-stack.err.log'
LogMsg 'launch start-stack.ps1 -NoBrowser (detached)'
Start-Process -FilePath 'powershell.exe' `
  -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$stack`"",'-NoBrowser') `
  -WorkingDirectory $Root -WindowStyle Hidden `
  -RedirectStandardOutput $stackOut -RedirectStandardError $stackErr | Out-Null

# 自己的就绪判定，最多等 150s
$up = $false; $panel = $false; $qq = $false; $bridge = $false
$bridgeLog = 'C:\Users\Eyjafjalla\qq-bridge-debug.log'
for ($i = 0; $i -lt 150; $i++) {
  Start-Sleep -Seconds 1
  $up    = [bool](Get-NetTCPConnection -State Listen -LocalPort 13080 -ErrorAction SilentlyContinue)
  $panel = [bool](Get-NetTCPConnection -State Listen -LocalPort 8899  -ErrorAction SilentlyContinue)
  if ($up) {
    $qq = [bool](Get-NetTCPConnection -LocalPort 6700 -EA SilentlyContinue | Where-Object { $_.State -eq 'Established' })
    if ($qq -and (Test-Path $bridgeLog)) {
      $tail = Get-Content $bridgeLog -Tail 400 -ErrorAction SilentlyContinue
      $bridge = [bool]($tail -match 'bridge module loaded')
    }
    if ($qq -and $bridge) { LogMsg "ready after $($i+1)s"; break }
  }
}
LogMsg "status: 13080=$up 8899=$panel qq-connected=$qq bridge-loaded=$bridge"
LogMsg '=== done ==='
