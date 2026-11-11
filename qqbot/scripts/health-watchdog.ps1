# QQ 健康看门狗：每 2 分钟由计划任务调用。
# 健康失败时写告警文件 + 日志，并按冷却时间弹一次 Windows 提示。
param(
  [switch]$NoPopup,
  [int]$CooldownMinutes = 30,
  [switch]$TestAlert
)

$ErrorActionPreference = 'SilentlyContinue'
$Root = 'D:\DSH\qqbot'
$Health = Join-Path $Root 'scripts\health.ps1'
$Log = Join-Path $Root 'logs\health-watchdog.log'
$AlertFile = Join-Path $Root 'data\health-alert.json'
$StateFile = Join-Path $Root 'data\health-alert-state.json'
$TitleFile = Join-Path $Root 'data\health-alert-title.txt'
$BodyFile = Join-Path $Root 'data\health-alert-body.txt'

function Log([string]$message) {
  Add-Content -Path $Log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message) -Encoding UTF8
}

if ($TestAlert) {
  $title = '大肥鱼告警测试（不涉及 QQ）'
  $body = "这是一条测试告警，用来验证无人登录时 SYSTEM 任务能否推到手机。`n`n时间：$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))`n主机：$env:COMPUTERNAME"
  Log 'TEST ALERT sent'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\notify-push.ps1') -Title $title -Body $body 2>&1 | Out-Host
  exit $LASTEXITCODE
}

$MaintState = Join-Path $Root 'data\maintenance-last.txt'

function Invoke-Maintenance {
  try {
    if (Test-Path $MaintState) {
      $last = [datetime](Get-Content $MaintState -Raw -Encoding UTF8).Trim()
      if (((Get-Date) - $last).TotalHours -lt 24) { return }
    }
    $rotate = Join-Path $Root 'scripts\rotate-logs.ps1'
    $prune = Join-Path $Root 'scripts\prune-backups.ps1'
    if (Test-Path $rotate) {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $rotate -Apply 2>&1 | Out-Null
    }
    if (Test-Path $prune) {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $prune -Apply 2>&1 | Out-Null
    }
    Set-Content -Path $MaintState -Value (Get-Date).ToString('o') -Encoding UTF8
    Log 'MAINTENANCE rotate-logs/prune-backups done'
  } catch {
    Log ("MAINTENANCE FAILED: {0}" -f $_.Exception.Message)
  }
}

function Ping-Heartbeat([bool]$ok) {
  $file = Join-Path $Root 'data\heartbeat-config.json'
  if (-not (Test-Path $file)) { return }
  try {
    $cfg = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json
    $url = [string]$cfg.url
    if ($url -eq '') { return }
    if (-not $ok) {
      $url = $url.TrimEnd('/') + '/fail'
    }
    Invoke-WebRequest -Uri $url -TimeoutSec 10 -UseBasicParsing | Out-Null
  } catch {
    Log ("HEARTBEAT FAILED: {0}" -f $_.Exception.Message)
  }
}

Invoke-Maintenance

$output = & powershell -NoProfile -ExecutionPolicy Bypass -File $Health 2>&1
$code = $LASTEXITCODE
$text = ($output | Out-String).Trim()

if ($code -eq 0) {
  Ping-Heartbeat $true
  if (Test-Path $AlertFile) {
    Remove-Item $AlertFile -Force
    Log 'RECOVERED'
  }
  exit 0
}

Ping-Heartbeat $false

$alert = [ordered]@{
  at = (Get-Date).ToString('o')
  exit = $code
  text = $text
}
$alert | ConvertTo-Json -Depth 4 | Set-Content $AlertFile -Encoding UTF8
Log ("FAIL exit={0} :: {1}" -f $code, (($text -split "`r?`n" | Select-Object -Last 1)))

# 冷却：默认 30 分钟最多弹一次，避免每 2 分钟轰炸。
$last = $null
if (Test-Path $StateFile) {
  try { $last = (Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json).lastAlertAt } catch { $last = $null }
}
$now = Get-Date
$canPopup = $true
if ($last) {
  try {
    $lastAt = [datetime]$last
    if (($now - $lastAt).TotalMinutes -lt $CooldownMinutes) { $canPopup = $false }
  } catch { $canPopup = $true }
}
if ($canPopup -and -not $NoPopup) {
  $title = 'QQ 机器人掉线'
  $body = "健康检查失败：`n`n$text`n`n时间：$($now.ToString('yyyy-MM-dd HH:mm:ss'))"
  $notifyConfig = Join-Path $Root 'data\notify-config.json'
  if (Test-Path $notifyConfig) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\notify-push.ps1') -Title $title -Body $body 2>&1 | Out-Null
  } else {
    $title | Set-Content $TitleFile -Encoding UTF8
    $body | Set-Content $BodyFile -Encoding UTF8
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Root 'scripts\show-alert.ps1')) -WindowStyle Hidden
  }
  [ordered]@{ lastAlertAt = $now.ToString('o') } | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8
}
exit 1
