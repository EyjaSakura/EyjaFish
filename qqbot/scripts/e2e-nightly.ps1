# Nightly e2e runner for the isolated test instance.
# It never touches the live 13080/6700 instance or the live profile.
# The test instance must already be running on 13081/6701 with injectEnabled=true / injectDryRun=true.
param(
  [string]$RuntimeFile = 'D:\DSH\qqbot-e2e\data\state\runtime.json',
  [int]$TimeoutSeconds = 180,
  [switch]$SkipModel
)

$ErrorActionPreference = 'Stop'
$runtime = $RuntimeFile
if (-not (Test-Path $runtime)) { Write-Host "E2E INSTANCE NOT READY: missing $runtime"; exit 2 }
foreach ($port in 13081, 6701) {
  $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listen) { Write-Host "E2E INSTANCE NOT READY: port $port not listening"; exit 2 }
}
if ($SkipModel) { Write-Host 'E2E PREFLIGHT OK'; exit 0 }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'e2e-real-agent.ps1') `
  -RuntimeFile $runtime -Text 'e2e nightly ping（忽略这条，只回一句 ok）' -TimeoutSeconds $TimeoutSeconds
exit $LASTEXITCODE
