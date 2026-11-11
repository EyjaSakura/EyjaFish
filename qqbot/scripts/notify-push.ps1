# 把告警推到手机：支持 ntfy / Server酱 / Telegram / 通用 webhook。
# 配置：D:\DSH\qqbot\data\notify-config.json
# 测试：powershell -File scripts\notify-push.ps1 -Test -DryRun
param(
  [string]$Title = '大肥鱼告警',
  [string]$Body = '',
  [string]$Config = 'D:\DSH\qqbot\data\notify-config.json',
  [switch]$Test,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if ($Test -and $Body -eq '') { $Body = '这是一条测试通知：如果你在手机上看到它，推送链路已通。' }

if (-not (Test-Path $Config)) {
  Write-Error "缺少推送配置：$Config（可复制 data\notify-config.example.json）"
  exit 2
}

$cfg = Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$provider = [string]$cfg.provider
if ($provider -eq '') { Write-Error 'notify-config.json 缺少 provider'; exit 2 }

function Send-Ntfy {
  $headers = @{ Title = $Title; Priority = 'high'; Tags = 'warning' }
  if ($cfg.token) { $headers['Authorization'] = "Bearer $($cfg.token)" }
  Invoke-RestMethod -Method Post -Uri $cfg.url -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($Body)) -ContentType 'text/plain; charset=utf-8' | Out-Null
}

function Send-ServerChan {
  # Server酱³ 的新地址是 https://<uid>.push.ft07.com/send/<sendkey>.send
  # 优先用配置里的完整 url；旧版只有 sendKey 时才回退 sctapi。
  if ($cfg.url) {
    $uri = [string]$cfg.url
  } elseif ($cfg.sendKey) {
    $uri = "https://sctapi.ftqq.com/$($cfg.sendKey).send"
  } else {
    throw 'Server酱配置需要 url（完整 API URL）或 sendKey'
  }
  $form = @{ title = $Title; desp = $Body }
  $response = Invoke-RestMethod -Method Post -Uri $uri -Body $form
  if ($null -ne $response.code -and [int]$response.code -ne 0) {
    throw "Server酱返回 code=$($response.code): $($response.message)"
  }
}

function Send-Telegram {
  $uri = "https://api.telegram.org/bot$($cfg.botToken)/sendMessage"
  $form = @{ chat_id = $cfg.chatId; text = "$Title`n`n$Body" }
  Invoke-RestMethod -Method Post -Uri $uri -Body $form | Out-Null
}

function Send-Webhook {
  $headers = @{ 'Content-Type' = 'application/json; charset=utf-8' }
  if ($cfg.token) { $headers['Authorization'] = "Bearer $($cfg.token)" }
  $payload = @{ title = $Title; body = $Body; at = (Get-Date).ToString('o') } | ConvertTo-Json -Depth 4
  Invoke-RestMethod -Method Post -Uri $cfg.url -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
}

try {
  if ($DryRun) {
    Write-Host "[dry-run] provider=$provider title=$Title body=$Body"
    exit 0
  }
  switch ($provider) {
    'ntfy'       { Send-Ntfy }
    'serverchan' { Send-ServerChan }
    'telegram'   { Send-Telegram }
    'webhook'    { Send-Webhook }
    default      { Write-Error "未知 provider：$provider"; exit 2 }
  }
  Write-Host "NOTIFY OK ($provider)"
  exit 0
} catch {
  Write-Error "NOTIFY FAILED ($provider): $($_.Exception.Message)"
  exit 1
}
