# start-tts.ps1 - start the local GPT-SoVITS TTS service (port 9880).
# Run it from a scheduled task, not as a child of a shell command: a process
# started inside a tool command gets killed when that command exits.
# ASCII only: PS 5.1 reads no-BOM UTF-8 as ANSI and dies silently on CJK text.
$ErrorActionPreference = 'SilentlyContinue'

$Root = 'D:\DSH\sing\GPT-SoVITS'
$Python = 'D:\DSH\sing\gptsv\Scripts\python.exe'
$LogDir = 'D:\DSH\qqbot\logs'

if (Get-NetTCPConnection -State Listen -LocalPort 9880 -ErrorAction SilentlyContinue) {
    Add-Content -Path (Join-Path $LogDir 'tts-start.log') -Value ('{0} already listening' -f (Get-Date -Format 'HH:mm:ss'))
    exit 0
}

Start-Process -FilePath $Python `
    -ArgumentList 'api_v2.py', '-a', '127.0.0.1', '-p', '9880', '-c', 'D:\DSH\sing\GPT-SoVITS\xiaohan2_tts.yaml' `
    -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir 'gptsv-api.out.log') `
    -RedirectStandardError (Join-Path $LogDir 'gptsv-api.err.log')

$ok = $false
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    if (Get-NetTCPConnection -State Listen -LocalPort 9880 -ErrorAction SilentlyContinue) { $ok = $true; break }
}

Add-Content -Path (Join-Path $LogDir 'tts-start.log') -Value ('{0} started ok={1} waited={2}s' -f (Get-Date -Format 'HH:mm:ss'), $ok, ($i * 2))
if (-not $ok) { exit 1 }
