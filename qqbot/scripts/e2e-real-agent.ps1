# 真实 agent e2e（手动/nightly，不进 CI）。
# 通过 bridge 的注入通道跑一轮真实 agent；默认要求 injectDryRun=true，不向 QQ 真发。
# 用法：
#   powershell -File scripts\e2e-real-agent.ps1 -Text "e2e ping"
#   powershell -File scripts\e2e-real-agent.ps1 -Text "e2e ping" -AllowRealSend
param(
  [string]$Text = 'e2e ping（忽略这条，只回一句 ok）',
  [long]$UserId = 1815442184,
  [int]$TimeoutSeconds = 180,
  [string]$RuntimeFile = 'C:\Users\Eyjafjalla\qq-runtime.json',
  [switch]$AllowRealSend
)

$ErrorActionPreference = 'Stop'
$runtimeFile = $RuntimeFile
if (-not (Test-Path $runtimeFile)) { throw "runtime snapshot missing: $runtimeFile" }
$rt = Get-Content $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
$injection = $rt.injection
if (-not $injection -or $injection.enabled -ne $true) {
  Write-Host 'INJECTION DISABLED'
  Write-Host '请先在对应 profile 的 cordis.patch.yml 打开 injectEnabled=true（建议同时 injectDryRun=true），重启该实例后再跑。'
  exit 2
}
if ($injection.dryRun -eq $false -and -not $AllowRealSend) {
  Write-Host 'REAL SEND BLOCKED'
  Write-Host '当前 injectDryRun=false，会真的发到 QQ。确认是测试号/测试群后加 -AllowRealSend。'
  exit 3
}

$injectFile = [string]$injection.file
if ($injectFile -eq '') { throw 'runtime snapshot 没有 injection.file' }
$before = [int]$injection.consumed
$line = @{ userId = $UserId; text = $Text } | ConvertTo-Json -Compress
Add-Content -LiteralPath $injectFile -Value $line -Encoding UTF8
Write-Host "injected to $injectFile (before consumed=$before, dryRun=$($injection.dryRun))"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$seen = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  try { $now = Get-Content $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
  if ([int]$now.injection.consumed -gt $before) {
    Write-Host "INJECTION CONSUMED (consumed=$($now.injection.consumed))"
    $seen = $true
    break
  }
}
if (-not $seen) {
  Write-Host "TIMEOUT waiting for injection consumption ($TimeoutSeconds s)"
  exit 1
}

# 消费只代表入站处理完成；再看 trace 是否出现 agent 阶段。
$traceFile = [string]$rt.trace.file
if ($traceFile -and (Test-Path $traceFile)) {
  $tail = Get-Content $traceFile -Tail 200 -Encoding UTF8 -ErrorAction SilentlyContinue
  $agent = @($tail | Where-Object { $_ -match '"stage":"agent"' }).Count
  if ($agent -gt 0) { Write-Host "AGENT TRACE SEEN ($agent events)" }
  else { Write-Host 'NO AGENT TRACE in last 200 lines（可能消息被命令/白名单提前处理）' }
}
Write-Host 'E2E DONE（真实模型回合是否产生回复，看 trace / 会话记录）'
exit 0
