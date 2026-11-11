# 以 SYSTEM 安装 QQ 健康看门狗任务（无人登录也会跑）。
# 必须用“以管理员身份运行”的 PowerShell 执行：
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\install-health-task.ps1
param(
  [string]$TaskName = 'DSH-QQBot-Health',
  [int]$IntervalMinutes = 2,
  [switch]$Remove,
  [switch]$TestAlert
)

$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error '需要管理员权限：请右键“以管理员身份运行” PowerShell，再执行本脚本。'
  exit 2
}

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "removed $TaskName"
  exit 0
}

if ($TestAlert) {
  $testName = "$TaskName-Test"
  $testScript = 'D:\DSH\qqbot\scripts\health-watchdog.ps1'
  $testAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -TestAlert -NoPopup' -f $testScript)
  $testTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
  $testPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $testSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $testName -Action $testAction -Trigger $testTrigger `
    -Principal $testPrincipal -Settings $testSettings -Force | Out-Null
  Write-Host ("installed {0}  user=SYSTEM  one-shot at {1:HH:mm}" -f $testName, (Get-Date).AddMinutes(1))
  Write-Host '锁屏等待 1-2 分钟；收到测试通知后可用 -Remove -TaskName DSH-QQBot-Health-Test 删除测试任务。'
  exit 0
}

$script = 'D:\DSH\qqbot\scripts\health-watchdog.ps1'
if (-not (Test-Path $script)) { Write-Error "missing $script"; exit 2 }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $script)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

$info = Get-ScheduledTask -TaskName $TaskName
Write-Host ("installed {0}  user={1}  logon={2}  every {3}m" -f $TaskName, $info.Principal.UserId, $info.Principal.LogonType, $IntervalMinutes)
