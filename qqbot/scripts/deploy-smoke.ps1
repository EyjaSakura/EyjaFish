$ErrorActionPreference = 'Stop'
$deploy = 'D:\DSH\qqbot\scripts\deploy.ps1'
$root = Join-Path $env:TEMP ('deploy-smoke-' + [guid]::NewGuid().ToString('N'))
$plugin = Join-Path $root 'plugin'
$backup = Join-Path $root 'backup'
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $plugin 'lib') | Out-Null
  '{ "name": "fake-plugin" }' | Set-Content (Join-Path $plugin 'package.json') -Encoding UTF8
  'v1' | Set-Content (Join-Path $plugin 'lib\a.js') -Encoding UTF8

  & powershell -NoProfile -ExecutionPolicy Bypass -File $deploy -Action deploy -PluginDir $plugin -BackupDir $backup -NoRestart | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'deploy failed' }

  'v2' | Set-Content (Join-Path $plugin 'lib\a.js') -Encoding UTF8
  & powershell -NoProfile -ExecutionPolicy Bypass -File $deploy -Action rollback -PluginDir $plugin -BackupDir $backup -NoRestart | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'rollback failed' }

  $restored = (Get-Content (Join-Path $plugin 'lib\a.js') -Raw -Encoding UTF8).Trim()
  if ($restored -ne 'v1') { throw "rollback mismatch: $restored" }
  Write-Host 'DEPLOY SMOKE OK'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
