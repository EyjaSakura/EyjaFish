param(
  [ValidateSet('deploy', 'rollback', 'list')]
  [string]$Action = 'list',
  [string]$PluginDir = 'D:\DSH\plugins\dsh-qq-onebot-bridge',
  [string]$BackupDir = 'D:\DSH\qqbot\backups\plugin',
  [switch]$DryRun,
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$webPort = 13080
$healthScript = 'D:\DSH\qqbot\scripts\health.ps1'
$nodeBin = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'

function Write-Step([string]$Message) { Write-Host "[deploy] $Message" }

function Assert-PluginDir {
  if (-not (Test-Path -LiteralPath $PluginDir -PathType Container)) {
    throw "plugin dir not found: $PluginDir"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $PluginDir 'package.json'))) {
    throw "not a plugin dir (package.json missing): $PluginDir"
  }
}

function Get-Backups {
  if (-not (Test-Path -LiteralPath $BackupDir)) { return @() }
  Get-ChildItem -LiteralPath $BackupDir -Filter 'plugin-*.zip' -File | Sort-Object LastWriteTime
}

function Restart-Web {
  if ($NoRestart) { Write-Step 'skip restart (-NoRestart)'; return }
  $proc = Get-NetTCPConnection -State Listen -LocalPort $webPort -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc) { Stop-Process -Id $proc.OwningProcess -Force; Start-Sleep -Seconds 3 }
  Start-Process -FilePath 'node.exe' -ArgumentList @("`"$nodeBin`"", 'web', '--port', "$webPort", '--no-open') `
    -WorkingDirectory 'C:\Users\Eyjafjalla' -WindowStyle Hidden `
    -RedirectStandardOutput 'D:\DSH\qqbot\logs\dsh-web.out.log' -RedirectStandardError 'D:\DSH\qqbot\logs\dsh-web.err.log'
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -State Listen -LocalPort $webPort -ErrorAction SilentlyContinue) { break }
  }
  Start-Sleep -Seconds 12
  & powershell -NoProfile -ExecutionPolicy Bypass -File $healthScript
  if ($LASTEXITCODE -ne 0) { throw 'health check failed after restart' }
}

Assert-PluginDir
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

switch ($Action) {
  'list' {
    $backups = Get-Backups
    if ($backups.Count -eq 0) { Write-Step 'no backups'; break }
    $backups | ForEach-Object { '{0}  {1:N1} KiB' -f $_.Name, ($_.Length / 1KB) }
  }
  'deploy' {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $zip = Join-Path $BackupDir "plugin-$stamp.zip"
    Write-Step "snapshot $PluginDir -> $zip"
    if ($DryRun) { Write-Step 'dry-run: no file changes'; break }
    Compress-Archive -Path (Join-Path $PluginDir '*') -DestinationPath $zip -Force
    if (-not (Test-Path -LiteralPath $zip)) { throw 'backup not created' }
    Write-Step ('backup ok: {0:N1} KiB' -f ((Get-Item $zip).Length / 1KB))
    Restart-Web
    Write-Step 'deploy ok'
  }
  'rollback' {
    $backups = Get-Backups
    if ($backups.Count -eq 0) { throw 'no backups to roll back to' }
    $zip = $backups[-1]
    Write-Step "restore $($zip.Name) -> $PluginDir"
    if ($DryRun) { Write-Step 'dry-run: no file changes'; break }
    $staging = Join-Path ([System.IO.Path]::GetTempPath()) ("plugin-rollback-" + [guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $staging -Force
    $rc = Start-Process -FilePath 'robocopy.exe' -ArgumentList @("`"$staging`"", "`"$PluginDir`"", '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -Wait -PassThru
    if ($rc.ExitCode -ge 8) { throw "robocopy failed: $($rc.ExitCode)" }
    Remove-Item -LiteralPath $staging -Recurse -Force
    Restart-Web
    Write-Step 'rollback ok'
  }
}
