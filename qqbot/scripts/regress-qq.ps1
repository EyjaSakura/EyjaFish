# Minimal QQ bridge regression:
#   add temp whitelist uid -> restart web -> simulate inbound -> expect reply -> revert -> restart
# Usage: pwsh -File regress-qq.ps1 [-TestUid 10000099] [-Text "Please reply with: REGRESSION_OK"]
param(
  [string]$TestUid = '10000099',
  [string]$Text = 'Please reply with exactly: REGRESSION_OK',
  [int]$TimeoutSec = 200
)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Root = 'D:\DSH\qqbot'
$Cfg = 'C:\Users\Eyjafjalla\.dsh\profiles\web\cordis.patch.yml'
$WebDir = 'C:\Users\Eyjafjalla\.dsh\profiles\web'
$Log = Join-Path $Root 'logs\regress-qq.log'
$Bin = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
$Selftest = Join-Path $WebDir 'sing-selftest2.mjs'
$Backup = "$Cfg.regress-bak"

function Log($m) {
  $line = (Get-Date -Format 'HH:mm:ss') + ' ' + $m
  Write-Host $line
  Add-Content -Path $Log -Value $line -Encoding UTF8
}

function Restart-Web {
  $p = (Get-NetTCPConnection -State Listen -LocalPort 13080 -EA SilentlyContinue | Select-Object -First 1).OwningProcess
  if ($p) { Stop-Process -Id $p -Force -EA SilentlyContinue }
  Start-Sleep -Seconds 3
  Start-Process -FilePath 'node.exe' -ArgumentList @("`"$Bin`"", 'web', '--port', '13080', '--no-open') `
    -WorkingDirectory 'C:\Users\Eyjafjalla' -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Root 'logs\dsh-web.out.log') `
    -RedirectStandardError (Join-Path $Root 'logs\dsh-web.err.log')
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Seconds 1; if (Get-NetTCPConnection -State Listen -LocalPort 13080 -EA SilentlyContinue) { break } }
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 1; if (Get-NetTCPConnection -State Listen -LocalPort 6700 -EA SilentlyContinue) { break } }
  Start-Sleep -Seconds 5
}

function Cleanup {
  if (Test-Path $Backup) {
    Move-Item $Backup $Cfg -Force
  }
  Get-ChildItem 'C:\Users\Eyjafjalla\.dsh\sessions' -Directory -Recurse -EA SilentlyContinue |
    Where-Object { $_.Name -match ([regex]::Escape('u' + $TestUid)) } |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -EA SilentlyContinue }
  Restart-Web
}

Log "=== regression start uid=$TestUid ==="
if (-not (Test-Path $Selftest)) { Log 'FAIL: selftest script missing'; exit 2 }

Copy-Item $Cfg $Backup -Force
$cfgText = Get-Content $Cfg -Raw -Encoding UTF8
$cfgText = $cfgText -replace 'allowUsers: \[([^\]]*)\]', ('allowUsers: [ $1, ' + $TestUid + ' ]')
$cfgText = $cfgText -replace 'adminUsers: \[([^\]]*)\]', ('adminUsers: [ $1, ' + $TestUid + ' ]')
[IO.File]::WriteAllText($Cfg, $cfgText, (New-Object System.Text.UTF8Encoding($false)))

Restart-Web
if (-not (Get-NetTCPConnection -State Listen -LocalPort 6700 -EA SilentlyContinue)) {
  Log 'FAIL: 6700 not listening after restart'
  Cleanup
  exit 3
}

Log 'sending simulated inbound...'
$out = & 'C:\Program Files\nodejs\node.exe' $Selftest $TestUid $Text 2>&1 | Out-String
$out | ForEach-Object { $_.Trim() } | Where-Object { $_ } | ForEach-Object { Log $_ }

$pass = $out -match 'SUCCESS'
Log ("result: " + $(if ($pass) { 'PASS' } else { 'FAIL' }))
Cleanup
Log '=== regression end ==='
if ($pass) { exit 0 } else { exit 1 }
