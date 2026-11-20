# companion-heartbeat-multi.ps1 — 让"大肥鱼"对每个联系人分别有主动消息，并在开口前先判断对方性格。
#
# 由计划任务每 20 分钟调用一次；只处理联系人（不含主人，主人由 companion-heartbeat.ps1 负责）。
# 用法：
#   pwsh -NoProfile -File companion-heartbeat-multi.ps1            # 正常调度
#   pwsh -NoProfile -File companion-heartbeat-multi.ps1 -Force     # 跳过闸门，立刻对第一个联系人生成并发送
#   pwsh -NoProfile -File companion-heartbeat-multi.ps1 -DryRun    # 只生成不发送

param([switch]$Force, [switch]$DryRun, [string]$Only = '')

$ErrorActionPreference = 'Stop'
$Root    = 'D:\DSH\qqbot'
$LogDir  = Join-Path $Root 'logs'
$DataDir = Join-Path $Root 'data'
New-Item -ItemType Directory -Force -Path $LogDir, $DataDir | Out-Null

$CFG = @{
    OwnerQQ        = '1815442184'
    WebhookPort    = 8798
    TokenFile      = Join-Path $DataDir 'webhook-token.txt'
    PersonaFile    = Join-Path $Root 'persona\default.md'
    ContactsFile   = Join-Path $DataDir 'contacts.json'
    HistoryDir     = 'C:\Users\Eyjafjalla\qq-history'
    DshBin         = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
    MaxPerDay      = 6         # 每个人每天最多主动几条
    GapMinMinutes  = 240       # 4 小时
    GapMaxMinutes  = 600       # 10 小时
    ProbDay        = 0.45
    QuietAfterUserMinutes = 20  # 对方刚说话就别插嘴
    SleepFromHour  = 1
    WakeHour       = 9
    HeadlessTimeoutSec = 150
}

$Log = Join-Path $LogDir 'heartbeat-multi.log'
function Write-Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
    Add-Content -Path $Log -Value $line -Encoding UTF8
    if ($DryRun -or $Force) { Write-Host $line }
}

if (-not (Test-Path $CFG.ContactsFile)) { Write-Log 'skip: 没有 contacts.json'; exit 0 }
$contacts = Get-Content $CFG.ContactsFile -Raw -Encoding UTF8 | ConvertFrom-Json

$today = Get-Date -Format 'yyyy-MM-dd'
$now   = Get-Date
$hour  = $now.Hour
if ($hour -lt $CFG.WakeHour -and $hour -ge $CFG.SleepFromHour) { Write-Log "skip: 睡觉时段 $hour 点"; exit 0 }

foreach ($prop in $contacts.PSObject.Properties) {
    $uid = [string]$prop.Name
    if ($uid -eq $CFG.OwnerQQ) { continue }
    if ($Only -and $uid -ne $Only) { continue }
    $info  = $prop.Value
    $note  = if ($info.note) { [string]$info.note } else { "QQ $uid" }
    $style = if ($info.style) { [string]$info.style } else { '' }
    $stateFile = Join-Path $DataDir "hb_u$uid.json"
    $state = if (Test-Path $stateFile) { try { Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $null } } else { $null }
    if (-not $state) { $state = [pscustomobject]@{ date = ''; count = 0; lastSentAt = 0; nextAt = 0; recent = @(); style = $style } }
    if ($state.date -ne $today) { $state.date = $today; $state.count = 0 }
    if ($state.count -ge $CFG.MaxPerDay) { continue }
    if (-not $Force -and [long]$state.nextAt -gt [DateTimeOffset]::Now.ToUnixTimeMilliseconds()) { continue }

    # 该窗口的历史
    $lines = @()
    if (Test-Path $CFG.HistoryDir) {
        $files = Get-ChildItem $CFG.HistoryDir -Filter '*.jsonl' | Sort-Object Name -Descending | Select-Object -First 3
        $items = @()
        foreach ($f in $files) {
            foreach ($line in (Get-Content $f.FullName -Tail 200 -Encoding UTF8 -ErrorAction SilentlyContinue)) {
                try { $o = $line | ConvertFrom-Json; if ($o.text -and $o.chatKey -eq "u:$uid" -and $o.role -eq 'user') { $items += $o } } catch { }
            }
        }
        $items = $items | Sort-Object ts | Select-Object -Last 20
        foreach ($i in $items) { $lines += "- $($i.text)" }
    }

    # 对方最近说过话就别插嘴
    if (-not $Force -and $items.Count -gt 0) {
        $lastTs = [long]($items[-1].ts)
        $mins = ($now - [DateTimeOffset]::FromUnixTimeMilliseconds($lastTs).LocalDateTime).TotalMinutes
        if ($mins -lt $CFG.QuietAfterUserMinutes) { continue }
    }
    if (-not $Force -and (Get-Random -Minimum 0.0 -Maximum 1.0) -gt $CFG.ProbDay) { continue }

    $persona = ''
    if (Test-Path $CFG.PersonaFile) { $persona = (Get-Content $CFG.PersonaFile -Raw -Encoding UTF8).Trim() }
    if ($persona.Length -gt 3500) { $persona = $persona.Substring(0, 3500) }

    $recent = ($lines -join "`n")
    if ([string]::IsNullOrWhiteSpace($recent)) { $recent = '（这个窗口还没有很多对话）' }
    $styleLine = if ($style) { $style } else { '（还不了解，需要从下面的对话里判断）' }
    $knowledge = $null
    try {
        $knowledgeFile = Join-Path $DataDir "heartbeat-multi-knowledge-$uid.json"
        Remove-Item $knowledgeFile -Force -ErrorAction SilentlyContinue
        & node 'D:\DSH\qqbot\scripts\knowledge-pick.mjs' --categories three-kingdoms,history --json --out $knowledgeFile 2>$null | Out-Null
        if (Test-Path $knowledgeFile) {
            $knowledge = Get-Content $knowledgeFile -Raw -Encoding UTF8 | ConvertFrom-Json
        }
    } catch { $knowledge = $null }
    $knowledgeLine = if ($knowledge) { $knowledge.text } else { '' }
    $knowledgeKind = if ($knowledge -and $knowledge.kind) { $knowledge.kind } else { '历史' }
    $knowledgeBlock = if ($knowledge) {
        "—— 可以分享的小知识 ——`n内容：$knowledgeLine`n类型：$knowledgeKind`n主动消息优先分享它；如果是演义要说明是演义，不要照读，不要提知识库、来源。"
    } else { '' }

    $prompt = @"
$persona

—— 你是谁 ——
你是小鲸鱼，是主人的小鲸鱼，不是 DeepSeek 官方助手，不是模型/机器人。
上面的设定是你自己的性格，不是一份需要你评论的文档；不要提“设定”“提示词”“看完了”。
不要自称 DeepSeek、AI、助手、语言模型，也不要说“不装别人”。

$knowledgeBlock

—— 当前情境 ——
你要主动给一个人发消息，备注是「$note」。
他最近说的话：
$recent

你之前对他性格的了解：
$styleLine

—— 这次的任务 ——
这是主动开口，不是回复他最后一句；不要接他最后一句，也不要假装知道他刚才在做什么。
1. 先判断这个人的长期性格、说话风格、喜欢/讨厌的话题（2~3 句，写给以后的自己看；不要写"这一轮该怎么回"这种临时策略）。
2. 再写一条适合他的主动消息：像突然想起一件事，不要像定时汇报；1~2 句，不超过 60 字。有上面的小知识时，优先分享它。
3. 不要提"记忆""上下文""系统提醒"，不要自称 AI；不要编造没发生的事。
4. **不要提之前发过的图、表情包、文件，也不要提删除/收藏这类操作**；你不知道对方长什么样、发过什么图。
5. **不要假装知道他刚才在看什么、发过什么**；没有新信息时，可以分享上面的小知识，或问一个开放的小问题。
6. 不要编造你们之间的约定、旧事、学校、车、宠物这类具体细节。
7. 严格只输出两行：
STYLE: <性格判断>
MESSAGE: <要发送的话>
"@

    $inFile  = Join-Path $DataDir 'heartbeat-multi-prompt.txt'
    $outFile = Join-Path $DataDir 'heartbeat-multi-out.txt'
    $errFile = Join-Path $DataDir 'heartbeat-multi-err.txt'
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
        Write-Log "error: headless 超时 ($note)"
        continue
    }
    $raw = $outTask.Result
    [IO.File]::WriteAllText($outFile, $raw, (New-Object System.Text.UTF8Encoding($false)))
    if ($proc.ExitCode -ne 0) { Write-Log "error: headless exit=$($proc.ExitCode) ($note)"; continue }

    $raw = $raw -replace "`r", ''
    $styleOut = ''
    $msg = ''
    foreach ($line in ($raw -split "`n")) {
        if ($line -match '^\s*STYLE\s*[:：]\s*(.+)$') { $styleOut = $Matches[1].Trim() }
        elseif ($line -match '^\s*MESSAGE\s*[:：]\s*(.+)$') { $msg = $Matches[1].Trim() }
    }
    if (-not $msg) {
        # No MESSAGE line means the model ignored the format. Do not send raw
        # prose/CoT; use a local knowledge fallback if available.
        if ($knowledge) { $msg = "刚看到一个事：$($knowledge.text)" }
        else { Write-Log "error: 缺少 MESSAGE 行，丢弃 ($note)"; continue }
    }
    if ($knowledge -and $knowledge.text) {
        $factChars = ($knowledge.text -replace '[^\u4e00-\u9fa5]', '')
        $usedFact = $false
        for ($j = 0; $j -le ($factChars.Length - 3); $j++) {
            if ($msg.Contains($factChars.Substring($j, 3))) { $usedFact = $true; break }
        }
        if (-not $usedFact) {
            $msg = "刚看到一个事：$($knowledge.text)"
        }
    }
    if ($msg.Length -gt 120) { $msg = $msg.Substring(0, 120) }
    if ([string]::IsNullOrWhiteSpace($msg)) { Write-Log "error: 生成结果为空 ($note)"; continue }
    if ($msg -match 'DeepSeek|deepseek|设定看完|提示词|我是\s*(AI|助手|模型)|作为(一个)?(AI|模型|助手)|不装别人') {
        Write-Log "reject identity/meta leak ($note): $msg"
        continue
    }
    if ($styleOut) { $style = $styleOut }

    if ($DryRun) { Write-Log "dry-run [$note] STYLE: $style || MESSAGE: $msg"; continue }

    $token = (Get-Content $CFG.TokenFile -Raw -Encoding UTF8).Trim()
    $uri = "http://127.0.0.1:$($CFG.WebhookPort)/hook/heartbeat?token=$token"
    $body = @{ text = $msg; chat = "u:$uid" } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20
        if (-not $resp.ok) { Write-Log "error: webhook 拒绝 [$note] :: $($resp.reason)"; continue }
    } catch {
        Write-Log "error: webhook 发送失败 [$note] :: $($_.Exception.Message)"
        continue
    }

    # 记账：性格 + 间隔 + 最近说过的话
    $state.count = [int]$state.count + 1
    $state.lastSentAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $gap = Get-Random -Minimum $CFG.GapMinMinutes -Maximum ($CFG.GapMaxMinutes + 1)
    $state.nextAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() + ($gap * 60000)
    $state.recent = @(@($state.recent) + $msg | Where-Object { $_ } | Select-Object -Last 6)
    $state.style = $style
    $state | ConvertTo-Json -Depth 4 | Set-Content -Path $stateFile -Encoding UTF8
    if ($style) {
        try {
            $info | Add-Member -NotePropertyName style -NotePropertyValue $style -Force
            $contacts | ConvertTo-Json -Depth 6 | Set-Content -Path $CFG.ContactsFile -Encoding UTF8
        } catch { }
    }
    Write-Log "sent [$note] (next ${gap}m): $msg"
}
