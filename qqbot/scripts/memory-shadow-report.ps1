# 记忆 shadow 日报：只读观察，不修改聊天行为。
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$core = 'D:\DSH\plugins\memory-core'
$outDir = 'D:\DSH\qqbot\data\memory'
$log = Join-Path $outDir 'shadow-report-run.log'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Push-Location $core
try {
  $text = & node 'bin\shadow-report.mjs' --days 1 2>&1 | Out-String
  $code = $LASTEXITCODE
  $text | Out-File -FilePath $log -Encoding UTF8 -Append
  if ($code -ne 0) {
    "memory shadow report failed: exit=$code" | Out-File -FilePath $log -Encoding UTF8 -Append
    exit $code
  }
  "memory shadow report ok: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $log -Encoding UTF8 -Append
  exit 0
} finally {
  Pop-Location
}
