# Queue regression (filesystem + logs):
#   - outbox entry seeded before restart must NOT be silently lost
#   - deferred backlog must be cleared on startup (no replay spam)
param([string]$TestUid = '10000021')
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Root = 'D:\DSH\qqbot'
$Cfg = 'C:\Users\Eyjafjalla\.dsh\profiles\web\cordis.patch.yml'
$Bin = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
$Log = Join-Path $Root 'logs\regress-queue.log'
$Outbox = Join-Path $env:USERPROFILE 'qq-outbox.json'
$Deferred = Join-Path $env:USERPROFILE 'qq-deferred-messages.json'
$BridgeLog = Join-Path $env:USERPROFILE 'qq-bridge-debug.log'
$BackupCfg = "$Cfg.queue-bak"
$BackupOut = "$Outbox.queue-bak"
$BackupDef = "$Deferred.queue-bak"

function Log($m) { $line = (Get-Date -Format 'HH:mm:ss') + ' ' + $m; Add-Content $Log $line -Encoding UTF8; Write-Host $line }
function Stop-Web { $p = (Get-NetTCPConnection -State Listen -LocalPort 13080 -EA SilentlyContinue | Select-Object -First 1).OwningProcess; if ($p) { Stop-Process -Id $p -Force -EA SilentlyContinue }; Start-Sleep -Seconds 3 }
function Start-Web {
  Start-Process -FilePath 'node.exe' -ArgumentList @("`"$Bin`"", 'web', '--port', '13080', '--no-open') -WorkingDirectory 'C:\Users\Eyjafjalla' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Root 'logs\dsh-web.out.log') -RedirectStandardError (Join-Path $Root 'logs\dsh-web.err.log')
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Seconds 1; if (Get-NetTCPConnection -State Listen -LocalPort 13080 -EA SilentlyContinue) { break } }
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 1; if (Get-NetTCPConnection -State Listen -LocalPort 6700 -EA SilentlyContinue) { break } }
  Start-Sleep -Seconds 5
}

Log "=== queue regression start uid=$TestUid ==="
Copy-Item $Cfg $BackupCfg -Force
$c = Get-Content $Cfg -Raw -Encoding UTF8
$c = $c -replace 'allowUsers: \[([^\]]*)\]', ('allowUsers: [ $1, ' + $TestUid + ' ]')
$c = $c -replace 'adminUsers: \[([^\]]*)\]', ('adminUsers: [ $1, ' + $TestUid + ' ]')
[IO.File]::WriteAllText($Cfg, $c, (New-Object System.Text.UTF8Encoding($false)))
if (Test-Path $Outbox) { Copy-Item $Outbox $BackupOut -Force }
if (Test-Path $Deferred) { Copy-Item $Deferred $BackupDef -Force }

Stop-Web
$now = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
[IO.File]::WriteAllText($Outbox, '[{"key":"u:' + $TestUid + '","messageType":"private","targetId":"' + $TestUid + '","text":"QUEUE_OUTBOX_OK","ts":' + $now + '}]', (New-Object System.Text.UTF8Encoding($false)))
[IO.File]::WriteAllText($Deferred, '{"u:' + $TestUid + '":[{"at":' + $now + ',"msg":{"userId":' + $TestUid + ',"groupId":null,"messageType":"private","messageId":"q-1","text":"QUEUE_DEFERRED_ECHO","raw":null,"ats":[],"reply":null,"records":[],"images":[],"files":[],"forwards":[],"forwardText":""}}]}', (New-Object System.Text.UTF8Encoding($false)))
Log 'seeded outbox + deferred'

Start-Web
Start-Sleep -Seconds 75

$outText = if (Test-Path $Outbox) { Get-Content $Outbox -Raw -Encoding UTF8 } else { '' }
$defText = if (Test-Path $Deferred) { Get-Content $Deferred -Raw -Encoding UTF8 } else { '' }
$recent = Get-Content $BridgeLog -Tail 300 -Encoding UTF8 -EA SilentlyContinue | Out-String

$outboxKept = $outText -match 'QUEUE_OUTBOX_OK'
$outboxDelivered = $recent -match '\[outbox\] delivered u:' + $TestUid
$outboxQueued = $recent -match '\[outbox\] queued'
$deferredCleared = ($defText.Trim() -eq '{}') -or ($defText.Trim() -eq '')
$deferredReplayed = $recent -match 'QUEUE_DEFERRED_ECHO'
$alive = [bool](Get-NetTCPConnection -State Listen -LocalPort 6700 -EA SilentlyContinue)

Log ("outbox kept=" + $outboxKept + " delivered=" + $outboxDelivered + " queued=" + $outboxQueued)
Log ("deferred cleared=" + $deferredCleared + " replayed=" + $deferredReplayed + " bridgeAlive=" + $alive)

$pass = $alive -and (($outboxKept -or $outboxDelivered) -and (-not $deferredReplayed))
Log ("result: " + $(if ($pass) { 'PASS' } else { 'FAIL' }))

if (Test-Path $BackupCfg) { Move-Item $BackupCfg $Cfg -Force }
if (Test-Path $BackupOut) { Move-Item $BackupOut $Outbox -Force } else { Remove-Item $Outbox -Force -EA SilentlyContinue }
if (Test-Path $BackupDef) { Move-Item $BackupDef $Deferred -Force } else { Remove-Item $Deferred -Force -EA SilentlyContinue }
Get-ChildItem 'C:\Users\Eyjafjalla\.dsh\sessions' -Directory -Recurse -EA SilentlyContinue | Where-Object { $_.Name -match 'u' + $TestUid } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -EA SilentlyContinue }
Stop-Web
Start-Web
Log '=== queue regression end ==='
if ($pass) { exit 0 } else { exit 1 }
