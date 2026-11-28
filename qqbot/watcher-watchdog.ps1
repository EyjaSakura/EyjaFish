# watcher-watchdog.ps1 — 抖音 watcher 看门狗：没进程或日志 8 分钟没更新就重启
# [douyin-off] 占用资源太大暂时关闭；存在 data\douyin-disabled.txt 时不重启。
$log = 'D:\DSH\qqbot\logs\douyin-watch.log'
$dir = 'D:\DSH\qqbot\douyin'
$disabled = 'D:\DSH\qqbot\data\douyin-disabled.txt'
if (Test-Path $disabled) {
  $reason = (Get-Content $disabled -Raw -Encoding UTF8).Trim()
  Add-Content 'D:\DSH\qqbot\logs\douyin-watchdog.log' ("{0}  disabled: {1}" -f (Get-Date -Format 's'), $reason) -Encoding UTF8
  exit 0
}
$proc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dm-watch\.mjs' }
$stale = $true
if (Test-Path $log) { $stale = ((Get-Date) - (Get-Item $log).LastWriteTime).TotalMinutes -gt 8 }
if (-not $proc -or $stale) {
  if ($proc) { $proc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
  Start-Sleep -Seconds 2
  Start-Process -FilePath 'node.exe' -ArgumentList 'dm-watch.mjs' -WorkingDirectory $dir -WindowStyle Hidden -RedirectStandardOutput 'D:\DSH\qqbot\logs\douyin-watch.out.log' -RedirectStandardError 'D:\DSH\qqbot\logs\douyin-watch.err.log'
  Add-Content 'D:\DSH\qqbot\logs\douyin-watchdog.log' ("{0}  restarted (stale={1}, proc={2})" -f (Get-Date -Format 's'), $stale, [bool]$proc) -Encoding UTF8
}
