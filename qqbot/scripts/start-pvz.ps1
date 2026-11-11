# start-pvz.ps1 - start the PvZ coop game server (8787) and the bot seat (8788).
# Run it from a scheduled task, not from a shell command: children started inside a
# tool command get killed when that command exits.
# ASCII only: PS 5.1 reads no-BOM UTF-8 as ANSI and dies silently on CJK text.

$ErrorActionPreference = 'SilentlyContinue'
$Root = 'D:\DSH\qqbot\pvz'
$LogDir = 'D:\DSH\qqbot\logs'
$Log = Join-Path $LogDir 'pvz-start.log'

function LogMsg($m) {
    Add-Content -Path $Log -Value ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m)
}

function Test-Port($port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

LogMsg '=== start-pvz begin ==='

if (-not (Test-Port 8787)) {
    Start-Process -FilePath 'node.exe' -ArgumentList 'server/index.mjs' -WorkingDirectory $Root -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir 'pvz-server.out.log') `
        -RedirectStandardError  (Join-Path $LogDir 'pvz-server.err.log')
    LogMsg 'server started'
} else {
    LogMsg 'server already listening on 8787'
}

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 400
    if (Test-Port 8787) { $ok = $true; break }
}
LogMsg ('server port 8787: ' + $ok)

if (-not (Test-Port 8788)) {
    Start-Process -FilePath 'node.exe' -ArgumentList 'bot/client.mjs' -WorkingDirectory $Root -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir 'pvz-bot.out.log') `
        -RedirectStandardError  (Join-Path $LogDir 'pvz-bot.err.log')
    LogMsg 'bot started'
} else {
    LogMsg 'bot already listening on 8788'
}

$ok2 = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 400
    if (Test-Port 8788) { $ok2 = $true; break }
}
LogMsg ('bot port 8788: ' + $ok2)
LogMsg '=== start-pvz end ==='
