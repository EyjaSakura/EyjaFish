# Start the GPT-SoVITS api_v2 on the AMD GPU (ZLUDA) on port 9880.
# Must be launched from a scheduled task: a process started inside a tool
# command is killed when that command exits.
# ASCII only: PS 5.1 reads BOM-less UTF-8 as ANSI.
$ErrorActionPreference = 'SilentlyContinue'

$Root = 'D:\DSH\GPT-SoVITS'
$Python = 'D:\DSH\voice\env_zluda\Scripts\python.exe'
$Launcher = 'D:\DSH\voice\zluda\run_api_gpu.py'
$LogDir = 'D:\DSH\qqbot\logs'

if (Get-NetTCPConnection -State Listen -LocalPort 9880 -ErrorAction SilentlyContinue) {
    Add-Content -Path (Join-Path $LogDir 'tts-start.log') -Value ('{0} 9880 busy, skip' -f (Get-Date -Format 'HH:mm:ss'))
    exit 0
}

$env:HIP_PATH = 'C:\Program Files\AMD\ROCm\5.7\'
$env:PATH = 'C:\Program Files\AMD\ROCm\5.7\bin;D:\DSH\voice\env_zluda\Scripts;' + $env:PATH
$env:ZLUDA_CACHE_DIR = 'D:\DSH\voice\zluda\cache'
$env:DSH_TTS_PORT = '9880'

Start-Process -FilePath $Python `
    -ArgumentList '-u', $Launcher `
    -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir 'tts-gpu.log') `
    -RedirectStandardError (Join-Path $LogDir 'tts-gpu.err.log')

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    if (Get-NetTCPConnection -State Listen -LocalPort 9880 -ErrorAction SilentlyContinue) { $ok = $true; break }
}
Add-Content -Path (Join-Path $LogDir 'tts-start.log') -Value ('{0} gpu start ok={1} waited={2}s' -f (Get-Date -Format 'HH:mm:ss'), $ok, ($i * 3))
if (-not $ok) { exit 1 }
