# test-campus-password.ps1 - detached test: logout -> login with stored password -> verify -> log
# ASCII only. Writes result to logs\campus-password-test.log
param([int]$DelaySec = 20)

$ErrorActionPreference = 'SilentlyContinue'
$Log = 'D:\DSH\qqbot\logs\campus-password-test.log'
$ReasonFile = 'D:\DSH\qqbot\data\campus-login-reason.txt'
$TsFile = 'D:\DSH\qqbot\data\campus-password-test-result.txt'
$PortalIp = '172.30.255.42'

function Write-Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
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

Write-Log "test scheduled in ${DelaySec}s"
Start-Sleep -Seconds $DelaySec

$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4DefaultGateway.NextHop -like '172.30.*' } | Select-Object -First 1
$ip = $cfg.IPv4Address.IPAddress
if (-not $ip) { Write-Log 'FAIL no campus ip'; Set-Content $TsFile 'FAIL no campus ip' -Encoding UTF8; exit 3 }

# logout
$ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$logout = "http://${PortalIp}:801/eportal/portal/logout?callback=dr1004&login_method=1&user_account=,0,452865&wlan_user_ip=$ip&wlan_user_mac=000000000000&wlan_ac_ip=&wlan_ac_name=&jsVersion=4.1.3&v=$ts"
try {
    $r = (Invoke-WebRequest -Uri $logout -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop).Content
    Write-Log "logout: $r"
} catch {
    Write-Log "logout failed: $($_.Exception.Message)"
}
Start-Sleep -Seconds 3
Write-Log "offline after logout: $(-not (Test-Internet))"

# login with stored credential (single attempt)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'D:\DSH\qqbot\scripts\campus-login.ps1' -Attempts 1 -IntervalSec 0
$rc = $LASTEXITCODE
Start-Sleep -Seconds 2
$online = Test-Internet
$reason = ''
if (Test-Path $ReasonFile) { $reason = (Get-Content $ReasonFile -Raw -Encoding UTF8).Trim() }

if ($rc -eq 0 -and $online) {
    Write-Log 'PASS password accepted, network restored'
    Set-Content $TsFile 'PASS password accepted' -Encoding UTF8
    exit 0
}

Write-Log "FAIL rc=$rc online=$online reason=$reason"
Set-Content $TsFile ("FAIL " + $reason) -Encoding UTF8

# not recovered: popup and poll for manual login (up to 15 min)
try {
    $tpl = Get-Content 'D:\DSH\qqbot\data\campus-alert-template.txt' -Raw -Encoding UTF8
    $body = $tpl.Replace('{reason}', $reason)
    Set-Content 'D:\DSH\qqbot\data\campus-alert-body-out.txt' -Value $body -Encoding UTF8
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File','D:\DSH\qqbot\scripts\show-alert.ps1','-TitleFile','D:\DSH\qqbot\data\campus-alert-title.txt','-BodyFile','D:\DSH\qqbot\data\campus-alert-body-out.txt' -WindowStyle Hidden
} catch { }

$started = Get-Date
while (((Get-Date) - $started).TotalMinutes -lt 15) {
    Start-Sleep -Seconds 5
    if (Test-Internet) {
        Write-Log 'manual login detected, network restored'
        Set-Content $TsFile 'MANUAL password likely wrong' -Encoding UTF8
        exit 0
    }
}
Write-Log 'gave up waiting manual login'
exit 1
