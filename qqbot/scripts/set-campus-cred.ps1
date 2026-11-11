# set-campus-cred.ps1 - store Dr.COM credentials with DPAPI (run once)
param(
    [Parameter(Mandatory = $true)][string]$User,
    [Parameter(Mandatory = $true)][string]$Pass
)
Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
$ErrorActionPreference = 'Stop'
$out = 'D:\DSH\qqbot\data\campus-cred.dat'
$json = '{"user":"' + $User + '","pass":"' + $Pass + '"}'
$bytes = [Text.Encoding]::UTF8.GetBytes($json)
$entropy = [Text.Encoding]::UTF8.GetBytes('dsh-campus')
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, 'CurrentUser')
[IO.File]::WriteAllBytes($out, $enc)
Write-Host ("cred written: {0} bytes -> {1}" -f $enc.Length, $out)
