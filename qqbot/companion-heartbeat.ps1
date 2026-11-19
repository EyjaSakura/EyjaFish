# companion-heartbeat.ps1 — 让"大肥鱼"主动找他说话。
#
# 由计划任务每 20 分钟调用一次；每次调用只是"有机会"，大多数时候什么都不做。
# 全部条件都在这里，改参数只改这个文件的 $CFG 段。
#
# 用法：
#   pwsh -NoProfile -File companion-heartbeat.ps1            # 正常调度（可能跳过）
#   pwsh -NoProfile -File companion-heartbeat.ps1 -Force     # 跳过所有闸门，立刻生成并发送
#   pwsh -NoProfile -File companion-heartbeat.ps1 -DryRun    # 只生成不发送，打印结果

param([switch]$Force, [switch]$DryRun)

$ErrorActionPreference = 'Stop'
$Root   = 'D:\DSH\qqbot'
$LogDir = Join-Path $Root 'logs'
$DataDir= Join-Path $Root 'data'
New-Item -ItemType Directory -Force -Path $LogDir, $DataDir | Out-Null

$CFG = @{
    ChatKey        = 'u:1815442184'
    WebhookPort    = 8798
    TokenFile      = Join-Path $DataDir 'webhook-token.txt'
    PersonaFile    = Join-Path $Root 'persona\default.md'
    StateFile      = Join-Path $DataDir 'heartbeat-state.json'
    LockFile       = Join-Path $DataDir 'heartbeat.lock'
    HistoryDir     = 'C:\Users\Eyjafjalla\qq-history'
    DshBin         = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
    MaxPerDay      = 6       # 每天最多主动几条（4A 修复：避免重新变成高频自言自语）
    MinGapMinutes  = 90      # 兜底下限（实际用随机间隔）
    GapMinMinutes  = 120     # 每次发完后随机决定下次最小间隔：2–4 小时
    GapMaxMinutes  = 240     # 上限
    ActiveFromHour = 9       # 白天"高概率"时段
    SleepFromHour  = 4       # 睡着（几乎不发）
    WakeHour       = 9       # 醒来
    ProbDay        = 0.5     # 09:00-24:00 每个 tick 的触发概率
    ProbNight      = 0.50    # 00:00-04:00 夜猫子概率
    QuietAfterUserMinutes = 8
    TargetChat     = 'u:1815442184'   # 心跳只参考这个窗口的历史   # 他刚说话就别打断
    HeadlessTimeoutSec = 150
}

$Log = Join-Path $LogDir 'heartbeat.log'
function Write-Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
    Add-Content -Path $Log -Value $line -Encoding UTF8
    if ($DryRun -or $Force) { Write-Host $line }
}

function Read-State {
    if (Test-Path $CFG.StateFile) {
        try { return Get-Content $CFG.StateFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
    }
    return [pscustomobject]@{ date = ''; count = 0; lastSentAt = 0; recent = @() }
}
function Save-State($s) {
    $s | ConvertTo-Json -Depth 4 | Set-Content -Path $CFG.StateFile -Encoding UTF8
}

$today = Get-Date -Format 'yyyy-MM-dd'
$now   = Get-Date
$state = Read-State
if ($state.date -ne $today) { $state.date = $today; $state.count = 0 }

# ---------- 闸门 ----------
$gapNeeded = if ($state.nextGapMinutes) { [double]$state.nextGapMinutes } else { [double]$CFG.MinGapMinutes }
$skip = $null
if (-not $Force) {
    $hour = $now.Hour
    if ($hour -ge $CFG.SleepFromHour -and $hour -lt $CFG.WakeHour) {
        $skip = "睡眠时段 $($CFG.SleepFromHour):00-$($CFG.WakeHour):00"
    }
    elseif ($state.count -ge $CFG.MaxPerDay) {
        $skip = "今日已达上限 $($CFG.MaxPerDay)"
    }
    elseif ((Test-Path $CFG.LockFile) -and ((Get-Date) - (Get-Item $CFG.LockFile).LastWriteTime).TotalMinutes -lt 10) {
        $skip = '上一次还在跑（锁未释放）'
    }
    elseif ($state.lastSentAt -gt 0 -and (($now - [DateTimeOffset]::FromUnixTimeMilliseconds([long]$state.lastSentAt).LocalDateTime).TotalMinutes -lt $gapNeeded)) {
        $skip = "距上一条不足 $([math]::Round($gapNeeded,0)) 分钟"
    }
    else {
        # 他最近有没有说话
        $lastUserTs = 0
        if (Test-Path $CFG.HistoryDir) {
            $files = Get-ChildItem $CFG.HistoryDir -Filter '*.jsonl' | Sort-Object Name -Descending | Select-Object -First 2
            foreach ($f in $files) {
                $last = Get-Content $f.FullName -Tail 1 -Encoding UTF8 -ErrorAction SilentlyContinue
                if ($last) {
                    try { $o = $last | ConvertFrom-Json; if ($o.chatKey -eq $CFG.TargetChat -and $o.ts -gt $lastUserTs) { $lastUserTs = [long]$o.ts } } catch { }
                }
            }
        }
        if ($lastUserTs -gt 0) {
            $mins = ($now - [DateTimeOffset]::FromUnixTimeMilliseconds($lastUserTs).LocalDateTime).TotalMinutes
            if ($mins -lt $CFG.QuietAfterUserMinutes) { $skip = "他 $([math]::Round($mins,1)) 分钟前刚说过话" }
        }
        if (-not $skip) {
            $p = if ($hour -lt $CFG.SleepFromHour) { $CFG.ProbNight } else { $CFG.ProbDay }
            if ((Get-Random -Minimum 0.0 -Maximum 1.0) -gt $p) { $skip = "随机闸门未通过（p=$p）" }
        }
    }
}
if ($skip -and -not $Force) {
    Write-Log "skip: $skip"
    exit 0
}

# ---------- 收集上下文 ----------
$persona = ''
if (Test-Path $CFG.PersonaFile) { $persona = (Get-Content $CFG.PersonaFile -Raw -Encoding UTF8).Trim() }
if ($persona.Length -gt 4200) { $persona = $persona.Substring(0, 4200) }

$recentLines = @()
if (Test-Path $CFG.HistoryDir) {
    $files = Get-ChildItem $CFG.HistoryDir -Filter '*.jsonl' | Sort-Object Name -Descending | Select-Object -First 2
    $items = @()
    foreach ($f in $files) {
        foreach ($line in (Get-Content $f.FullName -Tail 30 -Encoding UTF8 -ErrorAction SilentlyContinue)) {
            try { $o = $line | ConvertFrom-Json; if ($o.text -and $o.chatKey -eq $CFG.TargetChat -and $o.role -eq 'user') { $items += $o } } catch { }
        }
    }
    $items = $items | Sort-Object ts | Select-Object -Last 16
    foreach ($i in $items) { $recentLines += "- $($i.text)" }
}
$recentSent = @($state.recent | Select-Object -Last 6)
if ($recentSent.Count -gt 0) { $recentLines += '（你最近主动说过：' + ($recentSent -join ' / ') + '）' }

$clock = $now.ToString('yyyy-MM-dd HH:mm, dddd')
$prompt = @"
$persona

—— 当前情境 ——
现在是 $clock。
他最近说的话：
$($recentLines -join "`n")

—— 这次的任务 ——
你主动给他发一条消息。像突然想起一件事那样开口，不要像定时汇报。
要求：
1. 只输出你要发出去的那条消息正文，不要任何前缀、引号、解释、括号动作。
2. 1~2 句，总共不超过 40 个字。
3. 不要问"在吗""在干嘛"这种空话超过一次；优先分享一个具体的小念头、吐槽、或你正在做的事。
4. 不要重复你最近说过的话，不要报时，不要"早安/晚安/吃饭了吗"这类模板。
5. 不要使用任何工具，不要输出 Markdown，直接给文本。
6. 不要提"我记得""记忆""上下文""只记得几句话"这类系统状态，也不要自称 AI/助手/模型。
7. **不要假设任何没发生的事**：你并不知道他此刻在做什么。不许说"你刚才催我""你说过…""我们约好…"，也不许编造他的日程（考试、上班、开会、睡觉）。
8. 只有"他最近说的话"里明确出现过的内容才可以引用；没有就只说你自己的状态、刚想到的念头，或问一个开放的小问题。
9. 不要用质问、抱怨、催促的语气开场（"催什么""你怎么又…"）。你只是忽然想找他说话，不是在等他回话。
10. **不要提之前发过的图、表情包、文件，也不要提删除/收藏/0fa1 这类操作**；除非"他最近说的话"里最后 3 条明确说到。
12. 心跳发不了图：如果你想聊某张表情，不要在心跳里聊；留到正常对话里用工具把图发出来再说。
11. 不要假装知道他刚才在看什么、发了什么；你没有新信息时，就说自己的状态或问一个开放的小问题。
"@

# ---------- 生成 ----------
New-Item -ItemType File -Force -Path $CFG.LockFile | Out-Null
try {
    $inFile  = Join-Path $DataDir 'heartbeat-prompt.txt'
    $outFile = Join-Path $DataDir 'heartbeat-out.txt'
    $errFile = Join-Path $DataDir 'heartbeat-err.txt'
    [IO.File]::WriteAllText($inFile, $prompt, (New-Object System.Text.UTF8Encoding($false)))
    Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'node.exe'
    $psi.Arguments = "`"$($CFG.DshBin)`" --profile headless -"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $psi.CreateNoWindow = $true
    $proc = [Diagnostics.Process]::Start($psi)
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()
    $proc.StandardInput.Write($prompt)
    $proc.StandardInput.Close()
    if (-not $proc.WaitForExit($CFG.HeadlessTimeoutSec * 1000)) {
        try { $proc.Kill() } catch { }
        Write-Log 'error: headless 超时'
        exit 1
    }
    $raw = $outTask.Result
    $err = $errTask.Result
    [IO.File]::WriteAllText($outFile, $raw, (New-Object System.Text.UTF8Encoding($false)))
    if ($proc.ExitCode -ne 0) {
        Write-Log "error: headless exit=$($proc.ExitCode) :: $(($err -replace '\s+',' ').Trim())"
        exit 1
    }

    $msg = $raw
    $msg = $msg -replace '\r', ''
    $msg = $msg -replace '^\s*(大肥鱼|小鲸鱼|assistant|AI)\s*[:：]\s*', ''
    $msg = $msg -replace '[\*_`#>]', ''
    $msg = ($msg -split "`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 3) -join ' '
    $msg = $msg.Trim().Trim('"', "'", '“', '”')
    if ($msg.Length -gt 120) { $msg = $msg.Substring(0, 120) }
    if ([string]::IsNullOrWhiteSpace($msg)) {
        Write-Log 'error: 生成结果为空'
        exit 1
    }

    if ($DryRun) {
        Write-Log "dry-run message: $msg"
        exit 0
    }

    # ---------- 发送 ----------
    $token = (Get-Content $CFG.TokenFile -Raw -Encoding UTF8).Trim()
    $uri = "http://127.0.0.1:$($CFG.WebhookPort)/hook/heartbeat?token=$token"
    $body = @{ text = $msg } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json; charset=utf-8' `
            -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20
    } catch {
        Write-Log "error: webhook 发送失败 :: $($_.Exception.Message)"
        exit 1
    }
    if (-not $resp.ok) {
        Write-Log "error: webhook 拒绝 :: $($resp.reason)"
        exit 1
    }

    Write-Log "sent #$([int]$state.count + 1) (pending gap): $msg"   # [sent-log] 先记日志，避免状态写入失败时静默
    # ---------- 记账 ----------
    $state.count = [int]$state.count + 1
    $state.lastSentAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    # 每次随机决定"下次最早多久之后"，避免固定节拍（固定间隔本身是机器特征）
    $state.nextGapMinutes = Get-Random -Minimum $CFG.GapMinMinutes -Maximum ($CFG.GapMaxMinutes + 1)
    $state.recent = @(@($state.recent) + $msg | Where-Object { $_ } | Select-Object -Last 8)
    try { Save-State $state } catch { Write-Log "warn: 状态保存失败 :: $($_.Exception.Message)" }
}
finally {
    Remove-Item $CFG.LockFile -Force -ErrorAction SilentlyContinue
}
