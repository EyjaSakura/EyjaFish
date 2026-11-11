# campus-login.ps1 - Dr.COM eportal 4.0 auto login (ASCII only)
# Try 5 times, 3s apart. On failure write reason to data/campus-login-reason.txt
# Exit: 0 ok / 1 all attempts failed / 2 cred file / 3 no ip
param(
    [int]$Attempts = 5,
    [int]$IntervalSec = 3
)
Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
$ErrorActionPreference = 'SilentlyContinue'

$CredFile = 'D:\DSH\qqbot\data\campus-cred.dat'
$LogFile  = 'D:\DSH\qqbot\logs\campus-login.log'
$ReasonFile = 'D:\DSH\qqbot\data\campus-login-reason.txt'
$Portal   = 'http://172.30.255.42:801/eportal/portal/login'
$Entropy  = [Text.Encoding]::UTF8.GetBytes('dsh-campus')

function Write-Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Set-Reason([string]$r) {
    try { Set-Content -Path $ReasonFile -Value $r -Encoding UTF8 } catch { }
}

if (-not (Test-Path $CredFile)) { Set-Reason 'credential file missing'; Write-Log 'ERROR cred file missing'; exit 2 }

try {
    $enc  = [IO.File]::ReadAllBytes($CredFile)
    $json = [Text.Encoding]::UTF8.GetString(
        [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $Entropy, 'CurrentUser'))
    $cred = $json | ConvertFrom-Json
} catch {
    Set-Reason ('credential decrypt failed: ' + $_.Exception.Message)
    Write-Log "ERROR decrypt failed: $($_.Exception.Message)"
    exit 2
}

$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } |
       Sort-Object { if ($_.IPv4DefaultGateway.NextHop -like '172.30.*') { 0 } else { 1 } }
$ip = ($cfg | Select-Object -First 1).IPv4Address.IPAddress
if (-not $ip) { Set-Reason 'no IPv4 address on network adapter'; Write-Log 'ERROR no IPv4 address'; exit 3 }

$ts  = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$url = "$Portal" + "?callback=dr1003&login_method=1" +
       "&user_account=,0," + [uri]::EscapeDataString($cred.user) +
       "&user_password=" + [uri]::EscapeDataString($cred.pass) +
       "&wlan_user_ip=$ip&wlan_user_mac=000000000000&wlan_ac_ip=&wlan_ac_name=" +
       "&jsVersion=4.1.3&terminal_type=1&lang=zh-cn&v=$ts"

$lastReason = 'unknown error'
for ($i = 1; $i -le $Attempts; $i++) {
    $resp = $null
    try {
        $resp = (Invoke-WebRequest -Uri $url -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop).Content
    } catch {
        $resp = $null
    }

    if ($resp -and ($resp -match '"result":1' -or $resp -match '"ret_code":2')) {
        Write-Log "OK login attempt $i ip=$ip"
        Set-Reason ''
        exit 0
    }

    if ($resp) {
        $lastReason = $resp
        if ($resp -match '"msg":"([^"]+)"') { $lastReason = $Matches[1] }
        elseif ($resp -match '"ret_code":(\d+)') { $lastReason = 'ret_code ' + $Matches[1] }
    } else {
        $lastReason = 'no response (portal unreachable or timeout)'
    }
    Write-Log "attempt $i/$Attempts failed: $lastReason"
    if ($i -lt $Attempts) { Start-Sleep -Seconds $IntervalSec }
}

Set-Reason $lastReason
Write-Log "all $Attempts attempts failed: $lastReason"
exit 1
