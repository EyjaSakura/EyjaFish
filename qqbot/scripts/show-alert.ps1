# show-alert.ps1 - popup window for boot problems (ASCII code, UTF-8 content file)
param(
    [string]$TitleFile = 'D:\DSH\qqbot\data\campus-alert-title.txt',
    [string]$BodyFile  = 'D:\DSH\qqbot\data\campus-alert-body.txt'
)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms

$title = 'Notice'
$body  = ''
if (Test-Path $TitleFile) { $title = (Get-Content $TitleFile -Raw -Encoding UTF8).Trim() }
if (Test-Path $BodyFile)  { $body  = (Get-Content $BodyFile -Raw -Encoding UTF8).Trim() }

[void][System.Windows.Forms.MessageBox]::Show(
    $body,
    $title,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning
)
