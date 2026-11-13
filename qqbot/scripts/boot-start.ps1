# boot-start.ps1 - boot entry: campus login (5 tries) -> popup + wait for manual login -> voice -> bot stack
# ASCII only. Chinese alert text lives in data\campus-alert-title.txt / campus-alert-template.txt (UTF-8).
param([switch]$SkipStack, [switch]$SkipVoice)

$ErrorActionPreference = 'SilentlyContinue'
$LogDir = 'D:\DSH\qqbot\logs'
$Log    = Join-Path $LogDir 'boot-start.log'
$ReasonFile   = 'D:\DSH\qqbot\data\campus-login-reason.txt'
$TitleSrc     = 'D:\DSH\qqbot\data\campus-alert-title.txt'
$TemplateSrc  = 'D:\DSH\qqbot\data\campus-alert-template.txt'
$TitleOut     = 'D:\DSH\qqbot\data\campus-alert-title-out.txt'
$BodyOut      = 'D:\DSH\qqbot\data\campus-alert-body-out.txt'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
    Write-Host $line
    Add-Content -Path $Log -Value $line -Encoding UTF8
}

function Test-Internet {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $iar = $c.BeginConnect('www.baidu.com', 443, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(3000)
        if (-not $ok) { $c.Close(); return $false }
        $c.EndConnect($iar)
        $c.Close()
        return $true
    } catch { return $false }
}

function Show-Alert([string]$reason) {
    try {
        $title = 'Campus login failed'
        if (Test-Path $TitleSrc) { $title = (Get-Content $TitleSrc -Raw -Encoding UTF8).Trim() }
        $body = 'Reason: ' + $reason
        if (Test-Path $TemplateSrc) {
            $tpl = Get-Content $TemplateSrc -Raw -Encoding UTF8
            $body = $tpl.Replace('{reason}', $reason)
        }
        Set-Content -Path $TitleOut -Value $title -Encoding UTF8
        Set-Content -Path $BodyOut  -Value $body  -Encoding UTF8
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
                          '-File', 'D:\DSH\qqbot\scripts\show-alert.ps1',
                          '-TitleFile', $TitleOut, '-BodyFile', $BodyOut `
            -WindowStyle Hidden
    } catch { }
}

Write-Log 'boot-start begin'

# 1. wait for campus IPv4 (gateway 172.30.x.x), up to 120s
$hasIp = $false
for ($i = 0; $i -lt 60; $i++) {
    $cfg = Get-NetIPConfiguration | Where-Object {
        $_.IPv4DefaultGateway -and $_.IPv4DefaultGateway.NextHop -like '172.30.*'
    } | Select-Object -First 1
    if ($cfg -and $cfg.IPv4Address.IPAddress) { $hasIp = $true; break }
    Start-Sleep -Seconds 2
}
if ($hasIp) { Write-Log 'campus link up' } else { Write-Log 'WARN no campus IPv4 after 120s' }

# 2. login (skip when already online)
$online = Test-Internet
if ($online) {
    Write-Log 'internet already OK, skip auto login'
} else {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'D:\DSH\qqbot\scripts\campus-login.ps1' -Attempts 5 -IntervalSec 3
    $rc = $LASTEXITCODE
    Write-Log "campus-login rc=$rc"
    $online = Test-Internet
    Write-Log "internet after login: $online"

    if (-not $online) {
        $reason = 'unknown'
        if (Test-Path $ReasonFile) { $reason = (Get-Content $ReasonFile -Raw -Encoding UTF8).Trim() }
        if (-not $reason) { $reason = 'unknown' }
        Show-Alert $reason
        Write-Log "popup shown, waiting for manual login (reason: $reason)"

        # 3. poll until online (max 60 min)
        $started = Get-Date
        while (((Get-Date) - $started).TotalMinutes -lt 60) {
            Start-Sleep -Seconds 5
            if (Test-Internet) { $online = $true; break }
        }
        if ($online) { Write-Log 'manual login detected, continue' }
        else { Write-Log 'WARN still offline after 60min, continue with local services' }
    }
}

# 4. voice gateways (local, no internet needed)
if (-not $SkipVoice) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'D:\DSH\qqbot\scripts\start-tts-proxy.ps1'
    Write-Log "tts proxy start rc=$LASTEXITCODE"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'D:\DSH\sing\start-music.ps1'
    Write-Log "music proxy start rc=$LASTEXITCODE"
}

# 5. bot stack only when online
if (-not $SkipStack) {
    if ($online) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'D:\DSH\qqbot\start-stack.ps1' -Boot
        Write-Log "stack start rc=$LASTEXITCODE"
    } else {
        Write-Log 'SKIP stack start because offline'
    }
}

Write-Log 'boot-start done'
exit 0
