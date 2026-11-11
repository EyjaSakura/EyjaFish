# Incremental typecheck for core/services and bridge (separate baselines).
$ErrorActionPreference = 'Stop'
$root = 'D:\DSH\plugins\dsh-qq-onebot-bridge'
$tsc = 'D:\DSH\qqbot\tools\tsc\node_modules\typescript\bin\tsc'
if (-not (Test-Path $tsc)) { Write-Host 'TYPECHECK SKIP: typescript not installed'; exit 0 }
$jobs = @(
  @{ name = 'core+services'; config = 'tsconfig.check.json'; baseline = 'typecheck-baseline.json' },
  @{ name = 'bridge'; config = 'tsconfig.bridge.json'; baseline = 'typecheck-bridge-baseline.json' },
  @{ name = 'features'; config = 'tsconfig.features.json'; baseline = 'typecheck-features-baseline.json' }
)
Push-Location $root
foreach ($job in $jobs) {
  $baseline = (Get-Content $job.baseline -Raw -Encoding UTF8 | ConvertFrom-Json).count
  $out = & node $tsc -p $job.config 2>&1
  $errors = @($out | Select-String -Pattern 'error TS')
  $count = $errors.Count
  Write-Host "typecheck[$($job.name)] errors: $count (baseline $baseline)"
  if ($count -gt $baseline) {
    $errors | Select-Object -First 20 | ForEach-Object { Write-Host $_.Line }
    Pop-Location
    Write-Host "TYPECHECK FAILED: new errors in $($job.name)"
    exit 1
  }
  if ($count -lt $baseline) {
    Write-Host "TYPECHECK OK: $($job.name) below baseline, lower $($job.baseline) to $count"
  }
}
Pop-Location
Write-Host 'TYPECHECK OK'
