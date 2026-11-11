# 只回答一个问题：6700 是否有已建立的 QQ 会话。
# 单独进程调用，避免 health.ps1 里首次 CIM 查询偶发返回空。
$ErrorActionPreference = 'SilentlyContinue'
$all = @(Get-NetTCPConnection -State Established)
$ok = [bool]($all | Where-Object { $_.LocalPort -eq 6700 })
if ($ok) { 'True' } else { 'False' }
