param(
  [int]$Keep = 8,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$root = 'D:\DSH\qqbot\backups'
$archive = Join-Path $root 'archive\plugin'
$files = Get-ChildItem (Join-Path $root 'plugin') -Filter *.zip -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending
if ($files.Count -le $Keep) { Write-Host "plugin backups=$($files.Count), keep=$Keep, nothing to prune"; exit 0 }
$old = $files | Select-Object -Skip $Keep
foreach ($file in $old) {
  Write-Host ("{0}  {1:N1} MB  {2:yyyy-MM-dd}" -f $file.Name, ($file.Length / 1MB), $file.LastWriteTime)
  if ($Apply) {
    New-Item -ItemType Directory -Force -Path $archive | Out-Null
    Move-Item $file.FullName (Join-Path $archive $file.Name) -Force
  }
}
if (-not $Apply) { Write-Host 'dry-run only; add -Apply to move old zips to backups\archive\plugin' }
