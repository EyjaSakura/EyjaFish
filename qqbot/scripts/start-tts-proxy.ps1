# start-tts-proxy.ps1 - start the GPT-SoVITS TTS proxy on port 9998.
# The proxy spawns the api_v2 backends on demand (lazy), so nothing else needs
# to be started for voice. ASCII only: PS 5.1 reads BOM-less UTF-8 as ANSI.
$ErrorActionPreference = 'SilentlyContinue'

$Py = 'D:\DSH\voice\env\Scripts\python.exe'
$Work = 'D:\DSH\voice\tools'
$LogDir = 'D:\DSH\voice\logs'
$Out = Join-Path $LogDir 'proxy.out.log'
$Err = Join-Path $LogDir 'proxy.err.log'
# [voice-off] 占用内存太大暂时关闭；删除 data\voice-disabled.txt 才会恢复自动启动。
$VoiceDisabledFile = 'D:\DSH\qqbot\data\voice-disabled.txt'

if (Test-Path $VoiceDisabledFile) {
    $reason = (Get-Content $VoiceDisabledFile -Raw -Encoding UTF8).Trim()
    Add-Content -Path $Out -Value ('{0} voice disabled: {1}' -f (Get-Date -Format 'HH:mm:ss'), $reason) -Encoding UTF8
    exit 0
}

if (Get-NetTCPConnection -State Listen -LocalPort 9998 -ErrorAction SilentlyContinue) {
    Add-Content -Path $Out -Value ('{0} 9998 busy, skip' -f (Get-Date -Format 'HH:mm:ss'))
    exit 0
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Start-Process -FilePath $Py -ArgumentList 'tts_proxy.py', '--port', '9998' `
    -WorkingDirectory $Work -WindowStyle Hidden `
    -RedirectStandardOutput $Out -RedirectStandardError $Err

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Get-NetTCPConnection -State Listen -LocalPort 9998 -ErrorAction SilentlyContinue) { $ok = $true; break }
}

Add-Content -Path $Out -Value ('{0} proxy start ok={1} waited={2}s' -f (Get-Date -Format 'HH:mm:ss'), $ok, ($i * 2))
if (-not $ok) { exit 1 }
