# 真实发送 e2e：只对明确指定的测试 QQ / 测试群发一条注入消息。
# 默认只检查配置并打印计划，不会写入注入队列。
# 真发必须同时满足：
#   1. runtime injection.enabled=true
#   2. runtime injection.dryRun=false
#   3. 传入 -ConfirmRealSend
#   4. 指定 -GroupId 或 -UserId
param(
  [long]$GroupId = 0,
  [long]$UserId = 0,
  [string]$Text = '真实发送 e2e：收到这条说明链路通，请忽略。',
  [switch]$ConfirmRealSend
)

$ErrorActionPreference = 'Stop'
$runtimeFile = 'C:\Users\Eyjafjalla\qq-runtime.json'
if (-not (Test-Path $runtimeFile)) { throw "runtime snapshot missing: $runtimeFile" }
$rt = Get-Content $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
$injection = $rt.injection
if (-not $injection -or $injection.enabled -ne $true) {
  Write-Host 'INJECTION DISABLED：先打开 injectEnabled=true 并重启 13080。'
  exit 2
}
if ($injection.dryRun -ne $false) {
  Write-Host 'DRY-RUN ON：真实发送需要 injectDryRun=false。'
  exit 3
}
if ($GroupId -le 0 -and $UserId -le 0) {
  Write-Host '缺少目标：传 -GroupId <测试群> 或 -UserId <测试 QQ>。'
  exit 4
}
if (-not $ConfirmRealSend) {
  Write-Host ('PLAN ONLY：会向 {0} 发一条真实 QQ 消息；确认后加 -ConfirmRealSend。' -f $(if ($GroupId -gt 0) { "群 $GroupId" } else { "QQ $UserId" }))
  exit 0
}

$injectFile = [string]$injection.file
if ($injectFile -eq '') { throw 'runtime snapshot 没有 injection.file' }
$before = [int]$injection.consumed
$spec = @{ userId = $(if ($UserId -gt 0) { $UserId } else { 1815442184 }); text = $Text }
if ($GroupId -gt 0) { $spec.groupId = $GroupId }
$line = $spec | ConvertTo-Json -Compress
Add-Content -LiteralPath $injectFile -Value $line -Encoding UTF8
Write-Host "REAL SEND INJECTED to $(if ($GroupId -gt 0) { "group $GroupId" } else { "user $UserId" })"

$deadline = (Get-Date).AddSeconds(180)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  try { $now = Get-Content $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
  if ([int]$now.injection.consumed -gt $before) {
    Write-Host "INJECTION CONSUMED (consumed=$($now.injection.consumed))"
    exit 0
  }
}
Write-Host 'TIMEOUT waiting for injection consumption'
exit 1
