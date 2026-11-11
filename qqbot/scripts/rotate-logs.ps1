param(
  [int]$MaxMB = 20,
  [int]$Keep = 3,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$logDir = 'D:\DSH\qqbot\logs'
$candidates = Get-ChildItem $logDir -File | Where-Object { $_.Length -gt ($MaxMB * 1MB) } | Sort-Object Length -Descending
if ($candidates.Count -eq 0) { Write-Host "no log over ${MaxMB}MB"; exit 0 }
foreach ($file in $candidates) {
  Write-Host ("{0}  {1:N1} MB" -f $file.Name, ($file.Length / 1MB))
  if (-not $Apply) { continue }
  for ($i = $Keep - 1; $i -ge 1; $i--) {
    $src = "$($file.FullName).$i"
    $dst = "$($file.FullName).$($i + 1)"
    if (Test-Path $src) { Move-Item $src $dst -Force }
  }
  Move-Item $file.FullName "$($file.FullName).1" -Force
  New-Item -ItemType File -Path $file.FullName -Force | Out-Null
  Write-Host "rotated $($file.Name)"
}
if (-not $Apply) { Write-Host 'dry-run only; add -Apply to rotate' }
