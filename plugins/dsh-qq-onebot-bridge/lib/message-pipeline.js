// 自动抽取自 bridge.js #onQqMessageInner
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { parseRecurringReminder, parseReminder } from './reminders.js'
import { parseVoteCommand } from './grouptools.js'
import { isCheckinIntent, isCheckinBoardIntent } from './checkin.js'
import { parseKeywordCommand } from './keywords.js'
import { parseVerifyCommand } from './verify.js'
import { isQuietTime } from './shared-helpers.js'
import { ADMIN_COMMAND_CAPABILITY, OPS_ARG_WORDS } from './command-constants.js'
import { callMemoryRecall } from './services/memory-seam.js'


export async function onQqMessageInner({ message, bridge, defineTool, debugLog }) {
  // 「一切皆可调试」：每条入站消息开一条 trace，每个分支（含静默丢弃）都留下 stage + reason。
  const trace = bridge.beginTrace(message)
  const mark = (stage, ok = true, reason = '', data = null, level = 'info') => trace?.mark(stage, { ok, reason, data, level })

  if (!bridge.allowed(message)) {
    debugLog(`rejected u${message.userId} g${message.groupId ?? '-'}`)
    mark('whitelist', false, message.messageType === 'private'
      ? '私聊用户不在 allowUsers 白名单'
      : (!bridge.config.allowGroups.includes(message.groupId) ? '群不在 allowGroups 白名单' : '成员不在 allowUsers 白名单'))
    bridge.writeRuntimeSnapshot()
    return
  }
  mark('whitelist')
  try { bridge.markSeen(bridge.chatKeyOf(bridge.routeOf(message))) } catch { /* ignore */ } // [backfill]
  // 历史归档：只归档白名单会话的真实消息（注入/回放的假事件绝不入档，否则 /找 会被测试数据污染）。
  // 纯命令（以 / 或 ／ 开头）也不入档：否则每次 `/找 X` 都会把查询词自己写进归档，
  // 下一次搜索必然命中上一条搜索命令——检索结果被自己的回声污染。
  const archiveText = String(message.text ?? '').trim()
  const isCommandLine = archiveText.startsWith('/') || archiveText.startsWith('／')
  if (bridge.archive && message.__injected !== true && message.__replayed !== true && !isCommandLine) {
    try {
      const written = bridge.archive.append({
        ts: Date.now(),
        chatKey: bridge.chatKeyOf(bridge.routeOf(message)),
        userId: message.userId,
        name: message.senderName || '',
        kind: 'message',
        text: message.text ?? '',
      })
      // append() 自己吞异常只返回 false，所以失败必须在这里显式留痕——否则磁盘满/目录不可写时
      // 历史会静默丢失，而 /找 还会回答"最近 N 天没找到"（理由不真实，违反硬约束①）。
      if (written === false && bridge.archiveWarnedAt !== true) {
        bridge.archiveWarnedAt = true
        bridge.trace?.event({
          id: '', level: 'error', module: 'bridge', stage: 'archive', ok: false,
          reason: '历史归档写入失败（目录不可写或磁盘已满？），/找 的结果会不完整',
        })
        bridge.logger.warn('archive append failed: check historyArchiveDir permissions/space')
      } else if (written === true) {
        bridge.archiveWarnedAt = false
      }
    } catch (error) {
      debugLog(`archive append failed: ${error.message}`)
    }
  }
  if (isQuietTime(bridge.config, bridge.quietRanges)) {
    debugLog(`quiet hours, message ignored u${message.userId} g${message.groupId ?? '-'}`)
    mark('quiet', false, `避开高峰期静默中（${(bridge.config.quietHours ?? []).join(' / ')}）`)
    bridge.writeRuntimeSnapshot()
    return
  }
  if (message.__queued !== true && bridge.duplicate(message)) { // [queued-bypass-dedup] 队列回放不应被去重拦截
    debugLog(`duplicate message ignored id=${message.messageId} u${message.userId}`)
    mark('dedup', false, `重复投递：message_id=${message.messageId} 已在 ${bridge.config.dedupWindowSeconds}s 去重窗口内`)
    bridge.writeRuntimeSnapshot()
    return
  }
  if (bridge.config.pointsEnabled) bridge.awardMessagePoints(message)
  if (bridge.config.statsEnabled) bridge.recordStats(message)
  // 记一条最近原文：`/赞榜` 的摘要靠它（表情回应几乎都发生在消息刚发出后）。
  if (!isCommandLine) bridge.rememberText(message.messageId, archiveText)
  // 周报计数：白名单会话里的真实消息才算（注入/回放与命令不计，避免把测试数据算进运营数字）。
  if (!isCommandLine && message.__injected !== true && message.__replayed !== true) bridge.countOps('message')
  // 互动两件套（默认关）：标记已读 + 贴表情。都在白名单/静默/去重之后，
  // 只做「点一下就完事」的小动作，绝不改变正常的问答流程。
  await bridge.engagePassive(message, mark)
  // 文本 @ 归一化（v0.5.9）必须在**这里**做：下一行的 `text` 就是命令解析用的那一份，
  // 晚于此再改 `message.text` 命令就认不出行首了——真机实测的坑：门禁放行了，
  // 命令却因为文本是 "@机器人名 /打卡名册" 而被当成聊天丢给模型。
  if (message.messageType === 'group' && message.atMe !== true) {
    const name = await bridge.textMentionName(message)
    if (name !== '') message.textMentionName = name
  } else if (message.messageType === 'group') {
    // [本地补丁 群聊命令 @ 前缀 2026-10-09] 真 at 段这条路同样要归一化：
    // 段格式下 `parseMessage` 会把 at 渲染进正文（真机就是 `@10001 /ws`），
    // 命令不在行首 → 群里的 /ws /help /status 全被当成聊天丢给模型。
    message.text = bridge.stripSelfMention(message, message.text)
  }
  await bridge.handleIncomingVideo(message) // [qq-video]
  const text = message.text.trim()
  if (bridge.config.autoCollectStickers) void bridge.collectSticker(message)
  // 入群验证：申请人私聊答题（答对即放行，否则消费掉这条消息）。
  if (bridge.config.verifyEnabled && message.messageType === 'private' && await bridge.handleJoinAnswer(message, text)) {
    mark('verify', true, '入群验证答题（消息已消费）')
    return
  }
  // 防撤回缓存：每条入站消息都留一份（含图片 URL），撤回时补发。
  if (bridge.config.antiRecallEnabled) bridge.rememberForRecall(message, text)
  // 敏感词 / 刷屏：命中即拦下，不再进入模型。
  if ((bridge.config.filterEnabled || bridge.config.floodEnabled) && await bridge.handleContentFilter(message, text)) {
    mark('filter', true, '敏感词/刷屏拦截（消息未进入模型）')
    return
  }

  // [inj-cmd] 主人调试：/inj <uid> <text> 以该用户身份注入一句话
  if (text.startsWith('/inj ') && String(message.userId) === String(bridge.ownerQQ())) {
    const m = /^\/inj\s+(\d+)\s+([\s\S]+)$/.exec(text)
    if (m) {
      void bridge.handleInjection('message', { messageType: 'private', userId: Number(m[1]), groupId: null, messageId: 'inj-' + Date.now(), text: m[2] })
      await bridge.safeReply(message, '已注入')
      mark('command', true, '调试注入 /inj')
      return
    }
  }

  // ---- 免@低摩擦命令（白名单+静默检查后即处理，不进入 agent 会话）----
  if (text === '/help' || text === '帮助' || text === '菜单') {
    await bridge.handleHelp(message)
    mark('command', true, '命令 /help')
    return
  }
  if (bridge.config.checkinEnabled && bridge.canRun(message, 'cmd.checkin').allowed && isCheckinBoardIntent(text)) {
    await bridge.handleCheckinBoard(message)
    mark('command', true, '命令 签到榜')
    return
  }
  if (bridge.config.checkinEnabled && bridge.canRun(message, 'cmd.checkin').allowed && isCheckinIntent(text, bridge.config.checkinKeyword)) {
    await bridge.handleCheckin(message)
    mark('command', true, '命令 签到')
    return
  }
  if (bridge.config.voiceReadingEnabled && bridge.canRun(message, 'cmd.tts').allowed) {
    // 必须要求空白分隔：`/读图` 是 OCR 的别名，之前被 `/读` 前缀整条吃掉，
    // 结果是"发一条朗读『图』字的语音 + 消耗 TTS"，永远进不了 OCR（审查发现的 P2）。
    const ocrAlias = /^[\/／](?:ocr|OCR|识图|识字|读图)$/.test(text)
    const readCmd = ocrAlias ? null : /^[\/／]读(?:\s+(.*))?$/.exec(text)
    const readQuoteIntent = !ocrAlias && Boolean(message.reply?.messageId) && /(读|念)/.test(text) &&
      (message.messageType === 'private' || message.atMe)
    if (readCmd || readQuoteIntent) {
      await bridge.handleVoiceReading(message, readCmd ? String(readCmd[1] ?? '').trim() : '')
      mark('command', true, '命令 语音朗读')
      return
    }
  }
  if (bridge.config.imageGenEnabled && bridge.canRun(message, 'cmd.image').allowed) {
    const genCmd = String(bridge.config.imageGenCommand || '/画').trim()
    // 群聊需要 @机器人（生图有成本，防白嫖）；私聊直接可用。
    const genAllowed = message.messageType === 'private' || message.atMe
    if (genCmd && genAllowed && (text === genCmd || text.startsWith(`${genCmd} `))) {
      const prompt = text === genCmd ? '' : text.slice(genCmd.length).trim()
      await bridge.handleImageGen(message, prompt)
      mark('command', true, '命令 生图')
      return
    }
  }
  // ---- 进行中的群内小游戏（免 @，让群友直接接龙/猜数）----
  if (bridge.config.gameEnabled && bridge.canRun(message, 'cmd.game').allowed && await bridge.handleActiveGame(message, text)) {
    mark('game', true, '进行中的小游戏吃下这条消息')
    return
  }
  // ---- 关键词问答库（免模型、免 @；默认关闭）----
  if (bridge.config.keywordEnabled && await bridge.handleKeyword(message, text)) {
    mark('keyword', true, '关键词词库命中（未调用模型）')
    return
  }

  const hasRecords = Array.isArray(message.records) && message.records.length > 0
  const hasImages = Array.isArray(message.images) && message.images.length > 0
  const hasForwards = Array.isArray(message.forwards) && message.forwards.length > 0
  const sttActive = bridge.config.sttEnabled

  // 私聊语音不受限制：直接转文字回复（无需引用/@，也不受 acceptPrivate 约束）。
  if (message.messageType === 'private' && sttActive && hasRecords) {
    await bridge.handleVoice(message)
    mark('transcribe', true, '私聊语音转文字')
    return
  }

  // 私聊文件转存：收到的文件自动保存到本机。
  if (message.messageType === 'private' && bridge.config.fileTransferEnabled && Array.isArray(message.files) && message.files.length > 0 && !message.__videoSaved) { // [video-skip-transfer]
    await bridge.handlePrivateFiles(message)
    mark('media', true, '私聊文件转存')
    return
  }

  // @机器人 + 引用（回复）一条语音 → 转文字回复；私聊引用语音同样放行。
  const voiceQuoteRequest = sttActive && Boolean(message.reply?.messageId) &&
    (message.messageType === 'private' || (message.messageType === 'group' && message.atMe))

  if (text === '') {
    // 群聊纯语音/空文本默认忽略；仅「@+引用语音」「私聊图片/动画表情」
    // 「@机器人时直接发的图片」或「转发卡片」继续处理。
    const privateImageOnly = message.messageType === 'private' && bridge.config.privateImageView && bridge.visionOn(message) && hasImages
    const groupImageOnly = message.messageType === 'group' && bridge.groupImageAutoView(message) && hasImages
    const exempt = voiceQuoteRequest || privateImageOnly || groupImageOnly
    if (!exempt && !hasForwards) {
      mark('drop', false, `空文本且无可用媒体（records=${hasRecords ? '有' : '无'} images=${hasImages ? '有' : '无'} forwards=${hasForwards ? '有' : '无'}）`)
      bridge.writeRuntimeSnapshot()
      return
    }
    // 注意：语音引用与私聊图片是历史豁免路径（它们已经各自隐含了 @ 或私聊语义）。
    // 转发卡片**不在**豁免之列——空文本让下面的 else-if 链整体跳过，所以这里必须自己过门，
    // 否则一条没 @ 机器人的群转发会白白调一次 OneBot、还白跑一个模型回合。
    if (!exempt) {
      if (message.messageType === 'private' && !bridge.config.acceptPrivate) {
        debugLog(`private forward ignored (acceptPrivate=false) u${message.userId}`)
        mark('drop', false, 'acceptPrivate=false，私聊已关闭')
        return
      }
      if (message.messageType === 'group' && bridge.config.replyOnlyWhenMentioned && !message.atMe) {
        const byName = String(message.textMentionName ?? '')
        if (byName === '') {
          debugLog(`group forward without @bot ignored (u${message.userId} g${message.groupId})`)
          mark('mention', false, `群聊未 @ 机器人（replyOnlyWhenMentioned=true）${bridge.mentionLearnHint()}`)
          bridge.writeRuntimeSnapshot()
          return
        }
        mark('mention', true, `文本 @ 命中机器人名「${byName}」（这条没有 at 段：客户端把 @ 发成了纯文本）`)
      }
    }
  } else if (message.messageType === 'private' && !bridge.config.acceptPrivate) {
    if (!voiceQuoteRequest) {
      debugLog(`private msg ignored (acceptPrivate=false) u${message.userId}`)
      mark('drop', false, 'acceptPrivate=false，私聊已关闭')
      return
    }
  } else if (message.messageType === 'group' && bridge.config.replyOnlyWhenMentioned && !message.atMe) {
    const byName = String(message.textMentionName ?? '')
    if (byName === '') {
      debugLog(`group msg without @bot ignored (u${message.userId} g${message.groupId})`)
      mark('mention', false, `群聊未 @ 机器人（replyOnlyWhenMentioned=true）${bridge.mentionLearnHint()}`)
      bridge.writeRuntimeSnapshot()
      return
    }
    // 真机抓到：部分客户端把 @ 发成纯文本，正文里就是 "@昵称"、没有 at 段。
    mark('mention', true, `文本 @ 命中机器人名「${byName}」（这条没有 at 段：客户端把 @ 发成了纯文本）`)
  }

  // 合并转发（聊天记录）卡片：展开成正文，让模型真的看到里面写了什么。
  // 放在 @ / 私聊门控之后，避免对注定被丢弃的消息白白调用一次 OneBot。
  let forwardTranscript = ''
  if (hasForwards && bridge.config.forwardExpandEnabled !== false) {
    try {
      const expanded = trace
        ? await trace.step('forward', () => bridge.expandForwards(message), { module: 'bridge' })
        : await bridge.expandForwards(message)
      if (expanded.text) {
        forwardTranscript = expanded.text
        // 回写到消息对象：注入/回放路径与任何后续消费者都能直接拿到展开结果，
        // 不必再访问一次 QQ（也让"同一帧只展开一次"成立）。
        message.forwardText = forwardTranscript
        const extra = expanded.skippedCards > 0 ? `，另有 ${expanded.skippedCards} 张卡片未展开（单条消息最多展开 3 张）` : ''
        mark('forward', true, `转发内容已展开（${expanded.used}/${expanded.total} 条${expanded.truncated ? '，已截断' : ''}，来源 ${expanded.source}${extra}）`)
      } else {
        mark('forward', false, expanded.reason || '转发内容为空')
      }
    } catch (error) {
      debugLog(`forward expand failed: ${error.message}`)
      mark('forward', false, `转发展开失败：${error.message}`, null, 'warn')
    }
  } else if (hasForwards) {
    mark('forward', false, 'forwardExpandEnabled=false，转发卡片未展开')
  }

  debugLog(`msg from u${message.userId} g${message.groupId ?? '-'} m=${message.messageType} atMe=${message.atMe}: ${text.slice(0, 80)}`)
  // [busy-notice-any] 任何回合进行中，先回一句“在忙”，普通回合也算
  if (message.__injected !== true && message.__queued !== true) {
    try {
      const __k = bridge.routeKey(message)
      const __s = bridge.sessions.get(__k)
      if (__s && __s.turnActive === true && __s.currentTurnInjected !== true && (Date.now() - (__s.turnStartedAt || 0) < 5 * 60_000)) {
        void bridge.sendBusyNotice(message).catch(() => {})
      }
    } catch { }
  }
  // [inject-queue] 注入回合进行中：真人消息先排队，回合结束后再送
  if (message.__injected !== true && message.__queued !== true) {
    const __qkey = bridge.routeKey(message)
    const __qentry = bridge.sessions.get(__qkey)
    if (__qentry && __qentry.turnActive === true && __qentry.currentTurnInjected === true && (Date.now() - (__qentry.turnStartedAt || 0) < 5 * 60_000)) { // [stuck-guard]
      void bridge.sendBusyNotice(message).catch(() => {}) // [busy-notice]
      bridge.queueUserMessage(__qkey, message)
      return
    }
  }
  // [qzone-cache] 借有消息的时候刷新 qzone cookie，轮询时即使 socket 瞬时为空也能用
  if (bridge.config.qzoneAutoReply !== false) {
    bridge.qzoneCookieCache ??= { at: 0 }
    if (Date.now() - bridge.qzoneCookieCache.at > 10 * 60 * 1000) {
      try {
        const __sock = bridge.server.currentSocket()
        if (__sock) {
          const r = await bridge.server.action(__sock, 'get_cookies', { domain: 'qzone.qq.com' })
          const cookies = String((r && (r.cookies || r.data?.cookies)) || '')
          const bkn = String((r && (r.bkn || r.data?.bkn)) || '')
          const uin = (cookies.match(/(?:^|;\s*)uin=o?(\d+)/) || [])[1] || ''
          if (cookies && bkn && uin) {
            bridge.qzoneCookieCache = { cookies, bkn, uin, at: Date.now() }
            try { writeFileSync(join(bridge.memoryDir, '..', 'qq-qzone-cookies.json'), JSON.stringify(bridge.qzoneCookieCache), 'utf8') } catch { /* ignore */ } // [qzone-cookie-file]
          }
        }
      } catch (error) { debugLog('[qzone-cache] refresh failed: ' + error.message) }
    }
  }
  // [qzone-poll-on-msg] 趁连接活跃时触发一次轮询（5 分钟内最多一次）
  if (bridge.config.qzoneAutoReply !== false && Date.now() - (bridge.lastQzonePollAt ?? 0) > 5 * 60 * 1000) {
    bridge.lastQzonePollAt = Date.now()
    setTimeout(() => void bridge.pollQzoneComments().catch(() => {}), 15000)
  }
  let effectiveText = text
  const visionBlocks = []
  if (message.reply && message.reply.messageId) {
    try {
      const resolved = await trace
        ? await trace.step('quote', () => bridge.resolveQuoted(message), { module: 'bridge' })
        : await bridge.resolveQuoted(message)
      if (resolved.lines.length > 0 || resolved.blocks.length > 0) {
        const userPart = text !== ''
          ? `用户说：${text}`
          : resolved.hasVoice
            ? '用户引用了一条语音，请把这条语音的文字内容直接回复出来'
            : '请根据用户引用的消息内容回复'
        effectiveText = resolved.lines.length > 0 ? `[引用] ${resolved.lines.join('；')}\n\n${userPart}` : userPart
        visionBlocks.push(...resolved.blocks)
        mark('quote', true, `引用内容已解析（${resolved.lines.length} 行${resolved.hasVoice ? '，含语音' : ''}）`)
      } else if (text === '') {
        debugLog(`quoted message has no resolvable content, ignored (u${message.userId})`)
        mark('quote', false, '引用的消息没有可解析内容（且本条无文本）')
        return
      }
    } catch (error) {
      debugLog(`quote resolve failed: ${error.message}`)
      mark('quote', false, `引用解析失败：${error.message}`)
    }
  }

  // 主动查看对方发来的图片/动画表情：私聊总是看；群聊在被 @ 到（含文本 @ 命中）时也看。
  // 落盘后 native 模式把图片作为附件塞进同一轮上下文；tool 模式给模型一条路径 + 工具名。
  const autoViewImages = hasImages && (
    (message.messageType === 'private' && bridge.config.privateImageView && bridge.visionOn(message))
    || (message.messageType === 'group' && bridge.groupImageAutoView(message))
  )
  if (autoViewImages) {
    const where = message.messageType === 'private' ? '私聊' : '群聊'
    try {
      const result = await bridge.downloadMessageImages(message)
      const native = result.blocks.length > 0
      // 只读访客（群聊默认角色）没有 read_image，别在提示里承诺一个它没有的工具。
      const canReadTool = bridge.roleOf(message).guest !== true
      const askTool = canReadTool
        ? `请用 ${bridge.config.visionToolName} 查看图片，然后用文字回应。`
        : '（本会话没有读图工具，看不到这张图，请如实说明）'
      const toolHint = canReadTool ? `（可用 ${bridge.config.visionToolName} 查看）` : ''
      if (text === '') {
        effectiveText = native
          ? '对方发来一张表情（已附在本条消息中）。这是对话的延续或回应，不要当成新话题；最多回一句短话或回一个表情。'
          : `对方发来一张表情（没有文字）：\n${result.note}\n${askTool}（这是回应/续话，别当新话题）`
      } else {
        effectiveText = native
          ? `${effectiveText}\n\n用户同时发来了图片/动画表情（已附在本条消息中）。`
          : `${effectiveText}\n\n用户同时发送了图片/动画表情${toolHint}：\n${result.note}`
      }
      visionBlocks.push(...result.blocks)
      const hasStickerSeg = Array.isArray(message.raw?.message) && message.raw.message.some((seg) => seg && seg.type === 'image' && Number(seg.data?.sub_type) === 1)
      if (hasStickerSeg) { // [face-tag] nudge
        effectiveText += '\n\n（这张表情已自动存进 QQ 收藏。现在立刻用 qq_face_tag 记一句描述：画面+情绪，10~30 字；不填名字就是这张。这是必须做的。）'
      }
      mark('media', true, `${where}图片已落盘（native=${native}）`)
    } catch (error) {
      debugLog(`${where} image handling failed: ${error.message}`)
      mark('media', false, `${where}图片处理失败：${error.message}`)
    }
  }

  if (forwardTranscript !== '') {
    effectiveText = effectiveText === '' ? forwardTranscript : `${effectiveText}\n\n${forwardTranscript}`
  }

  if (text === '/new') {
    await bridge.rotate(message)
    await bridge.safeReply(message, '已开启新会话（旧的已完成）。现在直接发任务即可。')
    mark('command', true, '命令 /new（重开会话）')
    return
  }
  if (text === '/status') {
    const key = bridge.routeKey(message)
    const entry = bridge.sessions.get(key)
    const status = entry ? String(entry.handle.agent.status) : 'idle (no session)'
    const binding = bridge.workspaceBinding(key)
    const ws = binding ? ` · 工作区 ${binding.title}${binding.sessionId ? `（${binding.sessionId.slice(0, 8)}）` : '（下一条新建）'}` : ''
    await bridge.safeReply(message, `QQ 桥状态：${status} · 会话 ${entry ? entry.sessionId.slice(0, 8) : '无'}${ws}`)
    mark('command', true, '命令 /status')
    return
  }
  // [本地补丁] /handoff [status]：把「绑定 / 占位 / 对账 / 认领迁移 / 写权冲突」摊开给人看（R11）。
  if (text === '/handoff' || text.startsWith('/handoff ') || text === '/交接' || text === '/交接状态') {
    if (!bridge.canRun(message, 'cmd.handoff').allowed) {
      await bridge.safeReply(message, '⚠️ /handoff 只对管理员开放。')
      mark('command', false, '命令 /handoff（非管理员被拒）')
      return
    }
    const sub = text.replace(/^\/handoff(\s+|$)/, '').trim().toLowerCase()
    if (sub !== '' && sub !== 'status' && sub !== '状态') {
      await bridge.safeReply(message, '用法：/handoff status（看绑定与最近的交接事件）')
      mark('command', true, '命令 /handoff（用法提示）')
      return
    }
    await bridge.safeReply(message, bridge.formatHandoffStatus(bridge.routeKey(message)))
    mark('command', true, '命令 /handoff status')
    return
  }
  // [本地补丁] /ws：工作区切换命令（仅 owner；列表 / 切换 / 退出）。
  if (await bridge.handleWorkspaceCommand(message, text)) {
    mark('command', true, '命令 /ws（工作区切换）')
    return
  }
  // /撤回：撤回机器人自己最近发出的消息（免模型）。
  if (text === '/撤回' || text === '/recall' || text === '撤回上一条') {
    const recalled = await bridge.recallRecent(bridge.chatKeyOf(bridge.routeOf(message)), 1)
    await bridge.safeReply(message, recalled > 0 ? '已撤回上一条消息。' : '没有可撤回的消息（可能已超过可撤回时间或未记录）。')
    mark('command', true, `命令 /撤回（撤回 ${recalled} 条）`)
    return
  }
  // ---- 零成本互动包（本地计算，不消耗模型；群聊需 @）----
  if (bridge.config.fortuneEnabled && bridge.canRun(message, 'cmd.fortune').allowed && await bridge.handleFortune(message, text)) {
    mark('command', true, '本地功能：运势/抽签/塔罗')
    return
  }
  if (bridge.config.diceEnabled && bridge.canRun(message, 'cmd.dice').allowed && await bridge.handleDice(message, text)) {
    mark('command', true, '本地功能：骰子/随机抽人')
    return
  }
  if (bridge.config.pointsEnabled && bridge.canRun(message, 'cmd.points').allowed && await bridge.handlePointsCommand(message, text)) {
    mark('command', true, '本地功能：积分')
    return
  }
  if (bridge.config.statsEnabled && bridge.canRun(message, 'cmd.stats').allowed && await bridge.handleStatsCommand(message, text)) {
    mark('command', true, '本地功能：活跃统计')
    return
  }
  if (bridge.config.mcStatusEnabled !== false && bridge.canRun(message, 'cmd.mc').allowed && await bridge.handleMcStatus(message, text)) {
    mark('command', true, '本地功能：MC 服务器状态')
    return
  }
  if (bridge.config.gameEnabled && bridge.canRun(message, 'cmd.game').allowed && await bridge.handleGameCommand(message, text)) {
    mark('game', true, '小游戏开始/结束')
    return
  }
  if (bridge.config.dailyReportEnabled && await bridge.handleDailyReportCommand(message, text)) {
    mark('command', true, '命令 /日报')
    return
  }
  if (bridge.config.groupReadEnabled !== false && bridge.canRun(message, 'cmd.groupinfo').allowed && await bridge.handleGroupRead(message, text)) {
    mark('command', true, '只读群信息（荣誉/公告/精华）')
    return
  }
  if (bridge.config.memberQueryEnabled !== false && bridge.canRun(message, 'cmd.members').allowed && await bridge.handleMemberQuery(message, text)) {
    mark('command', true, '只读群信息（群成员）')
    return
  }
  if (bridge.config.groupReadEnabled !== false && bridge.canRun(message, 'cmd.groupinfo').allowed && await bridge.handleGroupInfo(message, text)) {
    mark('command', true, '只读群信息（群资料）')
    return
  }
  if (await bridge.handleFriendList(message, text)) {
    mark('command', true, '只读群信息（好友列表）')
    return
  }
  if (await bridge.handleOcr(message, text)) {
    mark('command', true, '只读：图片文字识别')
    return
  }
  if (await bridge.handleGroupFiles(message, text)) {
    mark('command', true, '群文件（列表/下载）')
    return
  }
  if (await bridge.handleAlbum(message, text)) {
    mark('command', true, '只读：群相册')
    return
  }
  if (await bridge.handleHistorySearch(message, text)) {
    mark('command', true, '历史检索（本地归档）')
    return
  }
  if (await bridge.handleBroadcastCommand(message, text)) {
    mark('command', true, '播报管理（/播报）')
    return
  }
  if (await bridge.handleEngageCommand(message, text)) {
    mark('command', true, '互动（戳一戳/点赞/赞榜/谁赞了）')
    return
  }
  if (await bridge.handleOpsCommand(message, text)) {
    mark('command', true, '群运营工具箱（打卡/查询/批量踢/待办/周报）')
    return
  }
  if (bridge.config.keywordEnabled && bridge.config.adminEnabled && bridge.canRun(message, 'cmd.keyword').allowed) {
    const keywordCmd = parseKeywordCommand(text)
    if (keywordCmd) {
      await bridge.handleKeywordAdmin(message, keywordCmd)
      mark('command', true, `命令 /kw ${keywordCmd.action}`)
      return
    }
  }
  if (text === '/取消提醒' || text === '/cancelreminder' || text.startsWith('/取消提醒 ')) {
    const arg = text.replace(/^\/取消提醒\s*/, '')
    await bridge.cancelReminder(message, arg)
    mark('command', true, '命令 /取消提醒')
    return
  }
  if (text === '/reminders') {
    await bridge.listReminders(message)
    mark('command', true, '命令 /reminders')
    return
  }
  if (text === '/health') {
    await bridge.handleHealth(message)
    mark('command', true, '命令 /health')
    return
  }
  if (text === '/export' && bridge.config.exportEnabled && bridge.canRun(message, 'cmd.export').allowed) {
    await bridge.handleExport(message)
    mark('command', true, '命令 /export')
    return
  }
  // ---- 管理命令（**每个动作按自己的权限点判定**；踢人需二次确认，写操作统一过闸门）----
  // 迁移说明：以前这里是"adminEnabled + isAdmin 一句话管全部"，现在拆成
  // group.ops.mute / kick / clear / notice / essence / card / title / leave，
  // 未匹配到映射的按 admin.config。行为与旧版一致（今天的 admin 身份本来就有全部这些权限），
  // 但控制台从此可以做到"给某角色只开踢人、不给禁言"。
  if (bridge.config.adminEnabled) {
    const adminCmd = /^\/(mute|unmute|kick|clear|公告|精华|取消精华|名片|头衔|全员禁言|解除全员禁言|退群)\s*(.*)$/.exec(text)
    const adminCap = adminCmd ? (ADMIN_COMMAND_CAPABILITY[adminCmd[1]] ?? 'admin.config') : ''
    if (adminCmd && bridge.canRun(message, adminCap).allowed) {
      await bridge.handleAdminCommand(message, adminCmd[1], adminCmd[2].trim())
      mark('command', true, `管理命令 /${adminCmd[1]}`)
      return
    }
    const confirm = /^(确认踢|取消)$/.exec(text)
    if (confirm && bridge.canRun(message, 'group.ops.kick').allowed) {
      await bridge.handleKickConfirm(message, confirm[1])
      mark('command', true, `管理命令 ${confirm[1]}`)
      return
    }
    if (bridge.config.verifyEnabled) {
      const verifyCmd = parseVerifyCommand(text)
      if (verifyCmd && bridge.canRun(message, 'admin.config').allowed) {
        await bridge.handleVerifyCommand(message, verifyCmd)
        mark('command', true, `入群审批 ${verifyCmd.action}`)
        return
      }
    }
  }
  // ---- 群工具 ----
  if (text === '/summary' && bridge.config.summaryEnabled) {
    await bridge.handleSummary(message)
    mark('command', true, '命令 /summary')
    return
  }
  if (bridge.config.voteEnabled && bridge.canRun(message, 'cmd.vote').allowed) {
    const voteCmd = parseVoteCommand(text)
    if (voteCmd) {
      await bridge.startVote(message, voteCmd)
      mark('command', true, '发起投票')
      return
    }
    if (text === '/vote') {
      await bridge.showVote(message)
      mark('command', true, '命令 /vote')
      return
    }
    if (text === '/vote-end') {
      await bridge.endVote(message)
      mark('command', true, '命令 /vote-end')
      return
    }
    if (await bridge.maybeVote(message)) {
      mark('command', true, '投票投票')
      return
    }
  }
  if (bridge.config.todoEnabled && bridge.canRun(message, 'cmd.todo').allowed) {
    const todoCmd = /^\/todo\b\s*(.*)$/.exec(text)
    if (todoCmd) {
      await bridge.handleTodo(message, todoCmd[1].trim())
      mark('command', true, '命令 /todo')
      return
    }
    const remember = /^(?:记一下|记着|待办)[:：]?\s*(.+)$/.exec(text)
    if (remember) {
      await bridge.handleTodo(message, `add ${remember[1].trim()}`)
      mark('command', true, '快捷待办')
      return
    }
  }
  // 定时提醒：群聊沿用 @ 过滤（@ 时允许省略"提醒"字样），私聊直接触发（需关键词）
  if (bridge.config.reminderEnabled) {
    const requireKeyword = !(message.messageType === 'group' && message.atMe)
    // 重复提醒优先：「每天8点」「每周一9点」「每个工作日15点」
    const recurring = bridge.config.recurringReminderEnabled === false ? null : parseRecurringReminder(text, requireKeyword)
    if (recurring) {
      await bridge.addReminder(message, { dueAt: recurring.nextAt, content: recurring.content, rule: { kind: recurring.kind, hour: recurring.hour, minute: recurring.minute, weekday: recurring.weekday } })
      mark('command', true, '重复提醒已登记')
      return
    }
    const parsed = parseReminder(text, requireKeyword)
    if (parsed) {
      await bridge.addReminder(message, parsed)
      mark('command', true, '一次性提醒已登记')
      return
    }
  }

  // 走到这里说明引用解析、私聊图片、转发展开都没能产出任何内容——典型是「只发了一张转发卡片，
  // 但展开为空/失败/被开关关掉」。绝不能拿一个空 user turn 去烧模型回合（有成本，而且模型
  // 收到空内容后容易在群里自说自话）。这是 v0.5 新增 hasForwards 豁免后必须回头补的复查。
  if (effectiveText === '') {
    mark('drop', false, hasForwards
      ? '转发卡片展开后没有可读内容（展开为空/失败，或 forwardExpandEnabled=false）'
      : '这条消息没有任何可交给模型的内容')
    bridge.writeRuntimeSnapshot()
    return
  }

  // 命令粘住了参数（`/设管理123456`）：命令不认（红线是**空白分隔**），但**绝不能**
  // 就这样交给模型——模型可能真去调工具。真机现场：用户发的 `/设管理17xxxxxxxx`
  // 没有空格 → 落到模型，白烧一回合，用户还以为"设管理失败了"。
  // 这里给一句明确的用法提示并结束这一轮（不静默、不烧模型）。
  const glued = /^[\/／]([^\s]{2,24})$/.exec(effectiveText)
  if (glued) {
    const word = OPS_ARG_WORDS.find((item) => glued[1].startsWith(item) && glued[1].length > item.length)
    if (word) {
      await bridge.safeReply(message, `⚠️ 命令和参数之间要留一个空格：「${effectiveText}」应该写成「${effectiveText.slice(0, 1)}${word} …」\n用法：/${word} @某人，或 /${word} 参数（命令一律**空白分隔**，粘在一起不认）`)
      mark('command', false, `命令粘住了参数（/${word}…）：命令一律空白分隔，没有交给模型`)
      bridge.writeRuntimeSnapshot()
      return
    }
  }

  let entry
  try {
    // 私聊「正在输入」（默认关）：模型动脑子之前先给对方一个反馈，回复落地时再撤销。
    if (bridge.engageOn('typingEnabled')) {
      const typing = await bridge.typingStart(message)
      mark('engage', typing.ok === true, typing.ok === true ? '已发送「正在输入」状态' : `「正在输入」未发送：${typing.reason}`, null, typing.ok === true ? 'info' : 'debug')
    }
    entry = await bridge.ensureSession(message)
    debugLog(`session ready ${entry.sessionId}`)
    mark('agent', true, `会话就绪 ${entry.sessionId.slice(0, 8)}${entry.resumed ? '（续接）' : '（新建）'}`)
    bridge.recordMemory(bridge.routeKey(message), 'user', effectiveText)
    entry.lastTraceId = trace?.id ?? ''
    entry.lastUserText = String(text ?? '')
    entry.lastUserAt = Date.now()
    entry.lastTurnIndex = Number(entry.lastTurnIndex || 0) + 1
    entry.lastTurnAt = Date.now()
    entry.lastInboundMessageId = message.messageId ?? ''
    // 统一走 #handoff 记账：主线之外的 followup（/summary、私聊语音、日报）也必须记账，
    // 否则注入帧的那一回合不会被判成注入回合 → 模型回复直接发到 QQ（真机审计发现的洞）。
    // [time-awareness] 每条消息带上当前时间，避免她拿上一轮的"深夜"当现在
    if (bridge.config.timeAwarenessEnabled !== false) {
      const __now = new Date()
      const __stamp = __now.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' })
      effectiveText = '[现在 ' + __stamp + '] ' + effectiveText
  try { // [video-share-detect] QQ 里出现抖音链接时提醒她可以用工具看
    const __flat = String(text).replace(/\s+/g, '')
    const __m = __flat.match(/https?:\/\/(?:v\.douyin\.com\/[A-Za-z0-9_\-]+|(?:www\.)?douyin\.com\/video\/\d+)/)
    if (__m) effectiveText += '\n\n（这条是抖音视频链接：' + __m[0] + '，可以用 douyin_analyze_video 看内容，再决定怎么回；不用把分析结果原样发出去。）' // [analyze-any]
  } catch { /* ignore */ }
  try {
    const __rk = bridge.routeKey(message)
    bridge.pushRecentMsg(__rk, message.messageId, '用户', text)
    const __rb = bridge.recentBlock(__rk)
    if (__rb) effectiveText += '\n\n' + __rb
  } catch { /* ignore */ } // [quote-reply]
    }
    // [shared-memory] 三个窗口共用同一份事实记忆
    let __sm = ''
    try {
      __sm = bridge.sharedMemoryBlock(bridge.chatKeyOf(bridge.routeOf(message))) || ''
    } catch { /* ignore */ }
    // [memory-seam] stage 0: feature-memory gets a recall seam. Shadow mode
    // must not change replies; on mode only replaces the block if it asks to.
    try {
      const __mr = await callMemoryRecall({
        bridge,
        context: {
          contractVersion: 1,
          message,
          key: bridge.routeKey(message),
          chatKey: bridge.chatKeyOf(bridge.routeOf(message)),
          fallbackText: __sm,
          budgetChars: 900,
        },
        debugLog,
      })
      if (__mr?.source) debugLog(`[memory] recall mode=${__mr.mode ?? '?'} source=${__mr.source} inject=${__mr.inject === true}`)
      if (__mr?.inject === true && typeof __mr.text === 'string' && __mr.text !== '') __sm = __mr.text
    } catch { /* keep legacy block */ }
    if (__sm) effectiveText = effectiveText + '\n\n' + __sm
    // [self-state] 一条鱼的状态层：三个窗口读同一份「我现在在干什么」
    try {
      const __ss = bridge.selfStateBlock(bridge.chatKeyOf(bridge.routeOf(message)))
      if (__ss) effectiveText = effectiveText + '\n\n' + __ss
    } catch { /* ignore */ }
    // [task-ack-reminder] 主人布置任务时，强制提醒先回一句再动手
    try {
      const __owner = String(bridge.config.ownerQq || bridge.config.owner || (bridge.config.adminUsers ?? [])[0] || '')
      const __isTask = /(帮我|帮忙|你去|去做|修一下|修下|改一下|改下|写个|写一|跑一下|跑个|查一下|查下|看一下|看下|整理|做一下|做个|实现|优化|部署|重启|配置)/.test(text)
      if (__owner && String(message.userId) === __owner && __isTask && text.length >= 8) {
        effectiveText += '\n\n【提醒】这是主人布置的任务：先用一句话说明你去做（例：行 我去看），再开始调工具；做完用两三句汇报结果或失败原因。'
      }
    } catch { }
    bridge.handoff(entry, message, {
      content: [{ type: 'text', text: effectiveText }, ...visionBlocks],
      source: { kind: 'user' },
    })
    debugLog(`followup sent`)
    bridge.countTurn(message, entry) // [session-rotate] 真人回合计数
    mark('agent', true, `已转交 agent（文本 ${effectiveText.length} 字${visionBlocks.length ? ` + ${visionBlocks.length} 张图` : ''}）`)
    bridge.writeRuntimeSnapshot(true)
  } catch (error) {
    debugLog(`agent failure: ${error.message}`)
    bridge.logger.error(`QQ agent failure: ${error.message}`)
    mark('agent', false, `agent 处理失败：${error.message}`, null, 'error')
    await bridge.safeReply(message, `⚠️ Agent 处理失败：${error.message}`)
  }
}
