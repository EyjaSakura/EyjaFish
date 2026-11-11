# Health check: ports, features, runtime snapshot, disk.
# Exit 1 when any check fails.
$ErrorActionPreference = 'SilentlyContinue'
$script:fail = 0
function Check($name, $ok, $detail) {
  if ($ok) { Write-Host ("PASS  {0}  {1}" -f $name, $detail) }
  else { Write-Host ("FAIL  {0}  {1}" -f $name, $detail); $script:fail += 1 }
}

foreach ($p in 13080, 6700) {
  $listening = [bool](Get-NetTCPConnection -State Listen -LocalPort $p -EA SilentlyContinue)
  Check "port:$p" $listening ($(if ($listening) { 'listening' } else { 'not listening' }))
}

# QQ 在线状态由 bridge 在 connect/disconnect 时写入 runtime snapshot，避免只凭端口判断。
$qqEstablished = $false

$statusFile = 'D:\DSH\plugins\features\status.json'
if (Test-Path $statusFile) {
  $features = (Get-Content $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json).features
  $loaded = @($features | Where-Object { $_.status -eq 'loaded' }).Count
  $disabled = @($features | Where-Object { $_.status -eq 'disabled' }).Count
  $bad = @($features | Where-Object { $_.status -ne 'loaded' -and $_.status -ne 'disabled' })
  Check 'features' ($bad.Count -eq 0) ("loaded=$loaded disabled=$disabled bad=$($bad.Count)")
} else {
  Check 'features' $false 'status.json missing'
}

$runtimeFile = 'C:\Users\Eyjafjalla\qq-runtime.json'
if (Test-Path $runtimeFile) {
  $runtime = Get-Content $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $age = [int]((Get-Date) - (Get-Item $runtimeFile).LastWriteTime).TotalSeconds
  $qqEstablished = ($runtime.botOnline -eq $true)
  Check 'runtime-snapshot' ($age -lt 180) ("age=${age}s")
  $qqDetail = if ($qqEstablished) { 'online' } else { 'offline (bridge has no QQ connect or got disconnect)' }
  Check 'qq:bot-online' $qqEstablished $qqDetail
} else {
  Check 'runtime-snapshot' $false 'qq-runtime.json missing'
  Check 'qq:bot-online' $false 'runtime snapshot missing'
}

$freeGb = [math]::Round((Get-PSDrive D).Free / 1GB, 1)
Check 'disk-D' ($freeGb -ge 5) ("free=${freeGb}GB")

$health = [ordered]@{
  at = (Get-Date).ToString('o')
  ok = ($script:fail -eq 0)
  fail = $script:fail
  qq = $qqEstablished
}
$health | ConvertTo-Json -Depth 4 | Set-Content 'D:\DSH\qqbot\data\health-last.json' -Encoding UTF8
if ($script:fail -gt 0) {
  $line = "{0}  FAIL({1})  qq-established={2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $script:fail, $qqEstablished
  Add-Content 'D:\DSH\qqbot\logs\health.log' -Value $line -Encoding UTF8
  Write-Host "HEALTH FAILED ($($script:fail))"
  exit 1
}
Write-Host 'HEALTH OK'
