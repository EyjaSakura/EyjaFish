// 自动拆分自 contacts/identity.js
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync, renameSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { join, basename, dirname, extname } from 'node:path'

const TIER_FILE = 'D:\\DSH\\qqbot\\data\\douyin-tier.json'

function readDouyinTier() {
  try {
    const j = JSON.parse(readFileSync(TIER_FILE, 'utf8').replace(/^\uFEFF/, ''))
    const t = Number(j.tier)
    return t >= 1 && t <= 3 ? t : 2
  } catch { return 2 }
}

function writeDouyinTier(tier, uid) {
  mkdirSync('D:\\DSH\\qqbot\\data', { recursive: true })
  writeFileSync(TIER_FILE, JSON.stringify({ tier, updatedAt: new Date().toISOString(), updatedBy: String(uid || '') }, null, 2), 'utf8')
}

export function registerDouyinTools({ agentCtx, route, key, role, bridge, defineTool, debugLog }) {
  const out = {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.detail }],
  }

agentCtx.tools.register(defineTool({
    name: 'douyin_set_remark',
    description: '给抖音好友起/改一个你用的备注（本地记忆），之后可以用备注称呼他。',
    parameters: {
      peer: { type: 'string', description: '抖音昵称或现有备注' },
      remark: { type: 'string', description: '新备注，例如 倩倩姐' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const peer = String(args.peer ?? '').trim()
      const remark = String(args.remark ?? '').trim()
      if (!peer || !remark) throw new Error('需要 peer 和 remark')
      const cfgPath = 'D:\\DSH\\qqbot\\douyin\\config.json'
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
      cfg.peers ??= {}
      let nick = peer
      if (!cfg.peers[nick]) {
        for (const [k, v] of Object.entries(cfg.peers)) if (v.aliases?.includes(peer) || v.note === peer) { nick = k; break }
      }
      cfg.peers[nick] ??= {}
      cfg.peers[nick].note = remark
      cfg.peers[nick].aliases = [...new Set([...(cfg.peers[nick].aliases || []), peer, remark])]
      writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8')
      return { ok: true, detail: '已把「' + nick + '」的备注记为「' + remark + '」' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_send_to',
    description: '用抖音私信给一个好友（按昵称）发消息，可带视频链接。用于时不时给朋友分享有趣的视频。',
    parameters: {
      peer: { type: 'string', description: '对方抖音昵称' },
      text: { type: 'string', description: '要发送的内容（可含链接）' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const peer = String(args.peer ?? '').trim()
      const text = String(args.text ?? '').trim()
      if (!peer || !text) throw new Error('需要 peer 和 text')
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-commands.jsonl', JSON.stringify({ id: 'to-' + Date.now(), cmd: 'dm_to', peer, text }) + '\n', 'utf8')
      return { ok: true, detail: '已安排发给抖音好友「' + peer + '」' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_feed',
    description: '刷抖音推荐流，返回一批视频（标题+链接），可从中挑一条分享给主人。',
    parameters: { count: { type: 'number', description: '可选：要几条，默认 8，最多 20' } },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      bridge.setActivity('刷抖音') // [activity]
      bridge.setSelfState('刷抖音', '', '') // [self-state]
      const id = 'feed-' + Date.now()
      const count = Math.min(20, Math.max(1, Number(args.count) || 8))
      const query = String(args.query ?? '').trim() // [feed-query]
      // [feed-deadline] 搜索页较慢，等待放宽到 120 秒
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-commands.jsonl', JSON.stringify({ id, cmd: 'feed', count, query }) + '\n', 'utf8')
      const file = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
      const deadline = Date.now() + 120000 // [feed-deadline]
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000))
        if (!existsSync(file)) continue
        const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const item = JSON.parse(line)
            if (item.id !== id) continue
            const vids = item.videos || []
            if (vids.length === 0) return { ok: false, detail: '这次没抓到视频，可能没登录或页面没加载出来' }
            const text = vids.map((v, i) => (i + 1) + '. ' + (v.title || '（无标题）') + '\n   ' + v.url).join('\n')
            return { ok: true, detail: '刷到 ' + vids.length + ' 条：\n' + text }
          } catch { /* ignore */ }
        }
      }
      return { ok: false, detail: '刷推荐流超时（抖音没响应）' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_tier',
    description: '查看或切换抖音视频分析档位：1=只看标题/简介，2=抽帧+转写+Qwen 逐帧（默认），3=Qwen 原生视频+转写。不传 tier 就是查询。',
    parameters: { tier: { type: 'number', description: '可选：1/2/3；不传则查询当前档位' } },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '只有主人能改档位' }
      const want = args?.tier == null ? 0 : Number(args.tier)
      if (!want) {
        const cur = readDouyinTier()
        return { ok: true, detail: '当前抖音分析档位：' + cur + ' 档' }
      }
      if (![1, 2, 3].includes(want)) return { ok: false, detail: '档位只能是 1 / 2 / 3' }
      writeDouyinTier(want, route?.targetId)
      return { ok: true, detail: '抖音分析档位已切到 ' + want + ' 档' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_analyze_video',
    description: '完整看一条视频（抖音链接或本地文件）：抽帧、语音转写、画面字幕、标题/简介/热评 + Qwen 多模态逐帧分析。耗时 1~4 分钟。',
    parameters: {
      url: { type: 'string', description: '可选：抖音链接' },
      file: { type: 'string', description: '可选：本地视频路径（别人分享时已自动下载的路径）' },
      title: { type: 'string', description: '可选：视频标题/作者' },
      mode: { type: 'string', description: '可选：deep（默认）/ quick' },
      shared: { type: 'boolean', description: '可选：这条是主人/好友分享给她的（true），还是她自己刷到的（false，默认）' },
    },
    output: out,
    async execute(args) {
      { // [analyze-any] 白名单好友也可以用（只读分析）
        const allow = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String)
        if (!allow.includes(String(route?.targetId ?? ''))) return { ok: false, detail: '不在白名单' }
      }
      const url = String(args.url ?? '').trim()
      const localFile = String(args.file ?? '').trim()
      if (!url && !localFile) throw new Error('需要 url 或 file')
      if (url && !/^https?:\/\//.test(url)) throw new Error('url 需要 http 链接')
      const tier = readDouyinTier()
      if (tier <= 1 && url) { // [tier-1] 只看标题/简介，不抽帧不转写
        const id = 'vd-' + Date.now()
        appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-commands.jsonl', JSON.stringify({ id, cmd: 'video', url }) + '\n', 'utf8')
        const rf = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
        const deadline1 = Date.now() + 60000
        while (Date.now() < deadline1) {
          await new Promise((r) => setTimeout(r, 1500))
          if (!existsSync(rf)) continue
          for (const line of readFileSync(rf, 'utf8').split('\n').filter(Boolean)) {
            try {
              const item = JSON.parse(line)
              if (item.id !== id) continue
              const v = item.video || {}
              return { ok: true, detail: '（1 档：只看标题/简介）\n标题：' + (v.title || '未提及') + '\n简介：' + String(v.desc || '').slice(0, 300) }
            } catch { /* ignore */ }
          }
        }
        return { ok: false, detail: '1 档取标题超时' }
      }
      const id = 'an-' + Date.now()
      bridge.setSelfState('看视频', '在分析一条抖音视频', '') // [self-state-analyze]
      const mode = tier >= 3 ? 'video3' : String(args.mode ?? 'deep') // 3 档走 Qwen 原生视频
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-commands.jsonl', JSON.stringify({ id, cmd: 'analyze', url, file: localFile, title: String(args.title ?? ''), mode, shared: args.shared === true }) + '\n', 'utf8') // [local-file-analyze]
      const file = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
      // [async-analyze] 登记后立刻返回，不占回合
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-pending.jsonl', JSON.stringify({ id, at: Date.now(), requester: String(route?.targetId ?? ''), peer: String(args.peer ?? '') }) + '\n', 'utf8')
      return { ok: true, detail: '已经开始看这条视频，大约 1~4 分钟；看完我会主动再回你。' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_video_info',
    description: '解析一条抖音视频链接：标题、作者、时长、简介；可选下载到本地。',
    parameters: {
      url: { type: 'string', description: '抖音视频链接' },
      download: { type: 'boolean', description: '可选：true 时下载视频到本地' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const url = String(args.url ?? '').trim()
      if (!/^https?:\/\//.test(url)) throw new Error('需要 http 链接')
      const run = (cmdArgs, timeout) => new Promise((resolve, reject) => {
        execFile('python', cmdArgs, { timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
          if (err) reject(new Error(String(stderr || err.message).slice(0, 300)))
          else resolve(String(stdout))
        })
      })
      const meta = JSON.parse(await run(['-m', 'yt_dlp', '-J', '--no-warnings', url], 90000))
      let saved = ''
      if (args.download === true) {
        const dir = 'D:\\DSH\\qqbot\\douyin\\videos'
        mkdirSync(dir, { recursive: true })
        const tpl = dir + '\\' + Date.now() + '.%(ext)s'
        await run(['-m', 'yt_dlp', '--no-warnings', '-o', tpl, url], 180000)
        saved = dir
      }
      const lines = [
        '标题：' + (meta.title || ''),
        '作者：' + (meta.uploader || ''),
        '时长：' + (meta.duration ?? '?') + ' 秒',
        '简介：' + String(meta.description || '').slice(0, 300),
      ]
      if (saved) lines.push('已下载到：' + saved)
      return { ok: true, detail: lines.join('\n') }
    },
  }))

agentCtx.tools.register(defineTool({ // [follow-card-tool]
    name: 'douyin_follow_card',
    description: '在抖音里找到一张名片并关注对方（只支持主人在抖音里关注过的朋友）。调用后等结果。',
    parameters: { name: { type: 'string', description: '名片上的昵称，例如 冬冰' }, peer: { type: 'string', description: '可选：哪个聊天窗口，默认主人窗口' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, detail: { type: 'string' } } }, render: (_a, v) => [{ type: 'text', text: v.detail }] },
    async execute(args) {
      const uid = String(route?.targetId ?? '')
      const allow = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String)
      if (!allow.includes(uid)) return { ok: false, detail: '不在白名单' }
      const name = String(args.name ?? '').trim()
      if (!name) throw new Error('需要名片昵称')
      const id = 'follow-' + Date.now()
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-commands.jsonl', JSON.stringify({ id, cmd: 'follow_card', name, peer: String(args.peer ?? bridge.config.peerName ?? '') }) + '\n', 'utf8')
      const file = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
      const deadline = Date.now() + 90000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
            if (!line.includes(id)) continue
            const j = JSON.parse(line)
            return { ok: Boolean(j.ok), detail: j.ok ? ('已关注「' + name + '」') : ('关注「' + name + '」失败') }
          }
        } catch { /* ignore */ }
      }
      return { ok: false, detail: '关注超时，稍后再试' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_send',
    description: '发抖音私信（文字或分享链接）。抖音窗口的回复必须用这个工具，不要发 QQ。',
    parameters: {
      text: { type: 'string', description: '要发送的内容' },
      peer: { type: 'string', description: '可选：发给哪个抖音好友（昵称）；不填发主人' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      let text = String(args.text ?? '').trim()
      if (!text) throw new Error('内容不能为空')
      if (!/https?:\/\//.test(text)) text = text.replace(/。/g, ' ').replace(/[!！]+/g, '口牙').replace(/[?？]+/g, '').replace(/\s+$/g, '').trim() // [douyin-punct]
      let __to = String(args.peer ?? '').trim()
      try {
        const cfg2 = JSON.parse(readFileSync('D:\\DSH\\qqbot\\douyin\\config.json', 'utf8'))
        if (!__to) __to = String(cfg2.peerName || '')
        for (const [nick, info] of Object.entries(cfg2.peers || {})) {
          if (nick === __to || info.note === __to || (info.aliases || []).includes(__to)) { __to = nick; break }
        }
      } catch { /* ignore */ } // [douyin-multi]
      const __id = 'dm-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000)
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-outbox.jsonl', JSON.stringify({ at: Date.now(), id: __id, peer: __to, text }) + '\n', 'utf8')
      bridge.douyinSentAt = Date.now() // [no-double-reply]
      // [dm-send-ack] 等 watcher 回执：抖音页面真的出现这条消息才算发出去
      const __res = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
      for (let __i = 0; __i < 40; __i += 1) {
        await new Promise((r) => setTimeout(r, 700))
        try {
          const rows = readFileSync(__res, 'utf8').split('\n').filter(Boolean)
          for (let j = rows.length - 1; j >= 0; j -= 1) {
            let row = null
            try { row = JSON.parse(rows[j]) } catch { continue }
            if (row && row.id === __id) {
              return row.ok
                ? { ok: true, detail: '已发送（抖音页面已确认）' }
                : { ok: false, detail: '发送失败：抖音页面没有出现这条消息' }
            }
          }
        } catch { /* results 还没有 */ }
      }
      return { ok: false, detail: '发送超时：抖音没确认，可能没发出去' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_send_image',
    description: '发一张图片到抖音私信（本地文件路径）。返回是否真的发出去。',
    parameters: {
      file: { type: 'string', description: '本地图片路径，例如 D:\\DSH\\qqbot\\data\\x.png' },
      peer: { type: 'string', description: '可选：发给哪个抖音好友（昵称）；不填发主人' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const file = String(args.file ?? '').trim()
      if (!file) throw new Error('需要本地图片路径')
      if (!existsSync(file)) throw new Error('文件不存在：' + file)
      let __to = String(args.peer ?? '').trim()
      try {
        const cfg2 = JSON.parse(readFileSync('D:\\DSH\\qqbot\\douyin\\config.json', 'utf8'))
        if (!__to) __to = String(cfg2.peerName || '')
        for (const [nick, info] of Object.entries(cfg2.peers || {})) {
          if (nick === __to || info.note === __to || (info.aliases || []).includes(__to)) { __to = nick; break }
        }
      } catch { /* ignore */ }
      const id = 'dmi-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000)
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-commands.jsonl', JSON.stringify({ id, cmd: 'dm_image', peer: __to, file }) + '\n', 'utf8')
      const resFile = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
      for (let i = 0; i < 45; i += 1) {
        await new Promise((r) => setTimeout(r, 700))
        try {
          const rows = readFileSync(resFile, 'utf8').split('\n').filter(Boolean)
          for (let j = rows.length - 1; j >= 0; j -= 1) {
            let row = null
            try { row = JSON.parse(rows[j]) } catch { continue }
            if (row && row.id === id) return row.ok ? { ok: true, detail: '图片已发送（抖音确认）' } : { ok: false, detail: '图片发送失败：抖音没出现这张图' }
          }
        } catch { /* ignore */ }
      }
      return { ok: false, detail: '图片发送超时：抖音没确认' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'douyin_share_video',
    description: '给主人分享一条抖音视频：发链接 + 一句话。',
    parameters: {
      url: { type: 'string', description: '视频链接' },
      text: { type: 'string', description: '可选：一句话说明' },
      peer: { type: 'string', description: '可选：发给哪个抖音好友（昵称）；不填发主人' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const url = String(args.url ?? '').trim()
      if (!/^https?:\/\//.test(url)) throw new Error('需要 http 链接')
      const note = String(args.text ?? '').trim()
      let peer = String(args.peer ?? '').trim()
      try {
        const cfg = JSON.parse(readFileSync('D:\\DSH\\qqbot\\douyin\\config.json', 'utf8'))
        if (!peer) peer = String(cfg.peerName || '')
        // 备注/别名 -> 抖音昵称
        for (const [nick, info] of Object.entries(cfg.peers || {})) {
          if (nick === peer || info.note === peer || (info.aliases || []).includes(peer)) { peer = nick; break }
        }
      } catch { /* ignore */ }
      try { await bridge.replyTo(route, '收到，我这就把视频发过去，稍等') } catch { /* ignore */ } // [share-ack]
      const id = 'sv-' + Date.now()
      appendFileSync('D:\\DSH\\qqbot\\douyin\\dm-commands.jsonl', JSON.stringify({ id, cmd: 'share_card', peer, url, text: note }) + '\n', 'utf8') // [share-video-file]
      const file = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
      const deadline = Date.now() + 150000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000))
        if (!existsSync(file)) continue
        for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
          try {
            const item = JSON.parse(line)
            if (item.id !== id) continue
            return item.ok ? { ok: true, detail: '视频已作为可播放文件发给 ' + peer } : { ok: false, detail: '视频发送失败（下载或上传没成功）' }
          } catch { /* ignore */ }
        }
      }
      return { ok: false, detail: '分享视频超时' }
    },
  }))
}
