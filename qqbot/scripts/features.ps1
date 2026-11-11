# 功能插件管理：list / status / disable / enable
# 用法：
#   powershell -File D:\DSH\qqbot\scripts\features.ps1 list
#   powershell -File D:\DSH\qqbot\scripts\features.ps1 disable sing
#   powershell -File D:\DSH\qqbot\scripts\features.ps1 enable sing -Restart
param(
  [ValidateSet('list', 'status', 'disable', 'enable', 'audit')]
  [string]$Action = 'list',
  [string]$Name = '',
  [switch]$Restart
)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Dir = 'D:\DSH\plugins\features'
$DisabledFile = Join-Path $Dir 'disabled.json'
$StatusFile = Join-Path $Dir 'status.json'

function Get-Disabled {
  try {
    if (Test-Path $DisabledFile) {
      $v = Get-Content $DisabledFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($v -is [array]) { return @($v | ForEach-Object { [string]$_ }) }
    }
  } catch { }
  return @()
}

function Save-Disabled([string[]]$names) {
  $clean = @($names | Where-Object { $_ } | Sort-Object -Unique)
  [IO.File]::WriteAllText($DisabledFile, (ConvertTo-Json -InputObject $clean -Compress), (New-Object System.Text.UTF8Encoding($false)))
}

function Get-Status {
  $map = @{}
  try {
    if (Test-Path $StatusFile) {
      $s = Get-Content $StatusFile -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($f in $s.features) { $map[[string]$f.name] = $f }
    }
  } catch { }
  return $map
}

$disabled = Get-Disabled
$status = Get-Status
$dirs = @(Get-ChildItem $Dir -Directory -EA SilentlyContinue | Select-Object -ExpandProperty Name | Sort-Object)

switch ($Action) {
  'list' {
    '{0,-12} {1,-10} {2}' -f 'FEATURE', 'STATE', 'HOOKS'
    foreach ($d in $dirs) {
      $state = if ($disabled -contains $d) { 'disabled' } elseif ($status[$d]) { $status[$d].status } else { 'unknown' }
      $hooks = if ($status[$d] -and $status[$d].hooks) { ($status[$d].hooks -join ',') } else { '' }
      '{0,-12} {1,-10} {2}' -f $d, $state, $hooks
    }
  }
  'status' {
    if (Test-Path $StatusFile) { Get-Content $StatusFile -Raw -Encoding UTF8 } else { 'no status.json (重启 web 后生成)' }
  }
  'audit' {
    if (-not (Test-Path $StatusFile)) { 'no status.json'; break }
    $s = Get-Content $StatusFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $dis = @($s.features | Where-Object { $_.status -eq 'disabled' })
    if ($dis.Count -eq 0) { '没有停用的功能插件'; break }
    '停用的功能插件及其数据路径：'
    foreach ($f in $dis) {
      "  - $($f.name)"
      foreach ($p in @($f.dataPaths)) { "      数据：$p" }
    }
    ''
    '提示：停用插件已撤销其工具入口，并在会话系统提示里加入数据访问禁令；'
    '      但拥有 shell/read 权限的身份（通常是主人）仍可在系统层直接读取这些路径。'
    '      要对主人也彻底封锁，需要在 OS 层对该账号做 ACL 拒绝，属于更高风险操作。'
  }
  'disable' {
    if (-not $Name) { 'need -Name'; break }
    if ($dirs -notcontains $Name) { "unknown feature: $Name"; break }
    Save-Disabled (@($disabled) + $Name)
    "disabled: $Name  (restart web to apply)"
    if ($Restart) { & 'D:\DSH\qqbot\scripts\restart-web-task.ps1' -WaitSeconds 2 }
  }
  'enable' {
    if (-not $Name) { 'need -Name'; break }
    Save-Disabled (@($disabled | Where-Object { $_ -ne $Name }))
    "enabled: $Name  (restart web to apply)"
    if ($Restart) { & 'D:\DSH\qqbot\scripts\restart-web-task.ps1' -WaitSeconds 2 }
  }
}
