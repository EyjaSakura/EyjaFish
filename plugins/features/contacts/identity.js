// 自动抽取自 bridge.js #registerIdentityTools
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

export function registerIdentityTools({ agentCtx, route, key, role, bridge, defineTool, debugLog }) {
  const out = {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.detail }],
  }

  // [pvz-tools] 植物大战僵尸双人合作的 8 个工具（数据走 8788 控制口）
  // [pvz-tools] 和本地 PvZ bot 的控制口说话（8788），工具本身只做转发
  const pvzBase = process.env.PVZ_BOT_URL || 'http://127.0.0.1:8788'
  const pvzCall = async (method, path, body) => {
    try {
      const res = await fetch(pvzBase + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok && data.ok !== false, data, error: data.detail || ('HTTP ' + res.status) }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  }
  const pvzDown = (e) => '连不上大肥鱼那局（8788 没起？）：' + e

  // [maa-tools] 明日方舟 MAA 的三个工具（只读写 maa\data / queue）
  // [maa-tools] 明日方舟 MAA：只读写 maa\data 和 queue，执行交给计划任务 DSH-MAA-Run
  const maaRoot = 'D:\\DSH\\qqbot\\maa'
  const maaData = join(maaRoot, 'data')
  const maaQueue = join(maaRoot, 'queue')
  const maaReadJson = (p) => {
    try { return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
  }
  const maaStages = () => {
    try { return JSON.parse(readFileSync('C:\\MAA\\runner\\stages.json', 'utf8').replace(/^\uFEFF/, '')) } catch { return {} }
  }
  const MAA_HUMAN = {
    ExceededLimit: '卡在某个界面（多半是没在主界面）',
    'need-main-menu': '游戏不在主界面，请先切回主界面',
    'stuck-90s': '90 秒没进展，可能界面不对或资源过期',
    'stopped-without-completion': '进程停了但没看到完成回调',
    'attach-failed': '窗口没绑上（尺寸/权限/最小化）',
    timeout: '任务超时',
  }
  const maaHuman = (r) => {
    if (!r) return ''
    const k = Object.keys(MAA_HUMAN).find((x) => String(r).includes(x))
    return k ? MAA_HUMAN[k] : String(r)
  }
  const maaStatusText = (j) => {
    if (!j) return '还没跑过任务（没有 job.json）'
    const NAME = { wakeup: '开始唤醒', mail: '领奖励', sanity: '清理智' }
    const parts = ['任务 ' + (NAME[j.task] || j.task || '?'), '状态 ' + (j.status || '?')]
    if (j.phase) parts.push('阶段 ' + j.phase)
    if (j.durationMs != null) parts.push('耗时 ' + Math.round(j.durationMs / 1000) + 's')
    if (j.reason) parts.push('原因 ' + maaHuman(j.reason))
    if (Array.isArray(j.shots) && j.shots.length) parts.push('截图 ' + j.shots.length + ' 张')
    return parts.join('，')
  }

  agentCtx.tools.register(defineTool({
    name: 'qq_contact_taste',
    description: '读一个好友最近的聊天记录，用来判断他喜欢什么。分享视频前先看喜好。',
    parameters: {
      user_id: { type: 'string', description: '好友 QQ 号' },
      count: { type: 'number', description: '可选：取多少条，默认 30' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const uid = String(args.user_id ?? '').replace(/\D/g, '')
      if (!uid) throw new Error('需要 user_id')
      const file = join(bridge.memoryDir, 'u_' + uid + '.json')
      if (!existsSync(file)) return { ok: false, detail: '没有这个人的聊天记录' }
      let hist = []
      try { hist = JSON.parse(readFileSync(file, 'utf8')).history || [] } catch { hist = [] }
      const n = Math.min(60, Math.max(5, Number(args.count) || 30))
      const lines = hist.slice(-n).map((m) => (m.role === 'user' ? '他：' : '你：') + String(m.text || '').replace(/\s+/g, ' ').slice(0, 60))
      return { ok: true, detail: 'QQ ' + uid + ' 最近聊天（' + lines.length + ' 条）：\n' + lines.join('\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_quote_reply',
    description: '带引用地回复一条消息。只在指代不明时用：回复最新的那条不用引用；回复更早的消息、或延续旧话题时，引用对应消息（id 见每条输入末尾的最近消息清单）。',
    parameters: {
      message_id: { type: 'string', description: '要引用的消息 id（见最近消息清单）' },
      text: { type: 'string', description: '要回复的内容' },
    },
    output: out,
    async execute(args) {
      const mid = String(args.message_id ?? '').trim()
      const body = String(args.text ?? '').trim()
      if (!mid || !body) throw new Error('需要 message_id 和 text')
      const socket = bridge.server.currentSocket()
      if (!socket) return { ok: false, detail: 'QQ 没连上' }
      const segments = [
        { type: 'reply', data: { id: mid } },
        { type: 'text', data: { text: body } },
      ]
      const r = await bridge.gate.run('send_private_msg', 'u:' + String(route?.targetId ?? ''), 'reply', () => bridge.server.sendSegments(socket, route.messageType, route.targetId, segments))
      if (!r.ok) throw new Error('发送被限流：' + r.reason)
      return { ok: true, detail: '已引用回复' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_send_to_user',
    description: '主人专属：主动给另一个白名单好友发私聊，可带图（例如把一张表情发给朋友）。只有主人在场时可用。',
    parameters: {
      user_id: { type: 'string', description: '对方 QQ 号（必须在白名单内）' },
      text: { type: 'string', description: '可选：文字内容' },
      image: { type: 'string', description: '可选：本地图片路径（允许发送的目录内）' },
      voice: { type: 'string', description: '可选：要朗读并发成语音的文字（跨窗口发语音）' }, // [xchat-voice]
    },
    output: out,
    async execute(args) {
      const uid = String(route?.targetId ?? '')
      const owner = bridge.ownerQQ()
      if (!owner || uid !== owner) return { ok: false, detail: '这个只跟主人说' }
      const to = String(args.user_id ?? '').replace(/\D/g, '')
      const text = String(args.text ?? '').trim()
      const image = String(args.image ?? '').trim() // [xchat-image]
      const voice = String(args.voice ?? '').trim() // [xchat-voice]
      if (!to || (!text && !image && !voice)) throw new Error('需要 user_id，以及 text / image / voice')
      const allow = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String)
      if (!allow.includes(to)) return { ok: false, detail: to + ' 不在白名单里，不能主动发' }
      const socket2 = bridge.server.currentSocket()
      let r
      if (voice) { // [xchat-voice] 跨窗口发语音
        const v = await bridge.sendVoiceTo({ bot: socket2, messageType: 'private', targetId: Number(to) }, voice)
        return { ok: true, detail: '语音已发给 ' + to + (text ? '（附言：' + text + '）' : '') + '：' + String(v || '') }
      }
      if (image) { // [xchat-image] 跨窗口发图
        const file = bridge.resolveSendPath(image, role)
        await bridge.sendImageTo({ bot: socket2, messageType: 'private', targetId: Number(to) }, file, text)
        try { bridge.recordMemory('u:' + to, 'assistant', text || '[图片]') } catch { /* ignore */ }
        return { ok: true, detail: '已把图片发给 ' + to + (text ? '（附言：' + text.slice(0, 20) + '）' : '') }
      }
      r = await bridge.gate.run('send_private_msg', 'u:' + to, 'proactive_send', () => bridge.server.sendText(socket2, 'private', Number(to), text))
      // [xchat-memory] 跨窗口发出的消息要记进对方会话，否则对方回复时她不知道这是自己主动问的
      try { bridge.recordMemory('u:' + to, 'assistant', text) } catch { /* ignore */ }
      if (!r.ok) throw new Error('发送被限流：' + r.reason)
      return { ok: true, detail: '已发给 ' + to + '：' + text.slice(0, 40) }
    },
  }))

  agentCtx.tools.register(defineTool({ // [self-state]
    name: 'qq_set_activity',
    description: '更新“你当前在干什么”，三个窗口共享；开始一件事或做完一件事时调用。只写 activity/detail/withWhom，不写对话内容。',
    parameters: {
      activity: { type: 'string', description: '在干什么，≤40 字，例如 训练语音模型' },
      detail: { type: 'string', description: '可选，细节，≤80 字' },
      withWhom: { type: 'string', description: '可选，和谁一起，填联系人名字，例如 主人' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, detail: { type: 'string' } } }, render: (_a, v) => [{ type: 'text', text: v.detail }] },
    async execute(args) {
      const uid = String(route?.targetId ?? '')
      const allow = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String)
      if (!allow.includes(uid)) throw new Error('不在白名单')
      const act = String(args.activity ?? '').trim()
      if (!act) throw new Error('需要 activity')
      const ok = bridge.setSelfState(act, args.detail, args.withWhom)
      return { ok, detail: ok ? ('记住了：现在在' + act.slice(0, 40)) : '写状态失败了' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_set_friend_remark',
    description: '给一个好友设置备注，并把这个备注记成他的身份（例如“主人的朋友”）。身份核验通过后用。',
    parameters: {
      user_id: { type: 'string', description: '对方 QQ 号' },
      remark: { type: 'string', description: '备注/身份，例如 主人的朋友·小林' },
    },
    output: out,
    async execute(args) {
      const uid = String(args.user_id ?? '').replace(/\D/g, '')
      const remark = String(args.remark ?? '').trim()
      if (!uid || !remark) throw new Error('需要 user_id 和 remark')
      const r = await bridge.gate.run('set_friend_remark', 'u:' + uid, 'set_remark', () => bridge.server.action(bridge.server.currentSocket(), 'set_friend_remark', { user_id: Number(uid), remark }))
      if (!r.ok) throw new Error('改备注被限流：' + r.reason)
      // 记入 contacts.json
      try {
        const f = bridge.config.contactsFile
        let all = {}
        try { all = JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) } catch { all = {} }
        all[uid] = { ...(all[uid] || {}), note: remark } // [self-state] 保留 name/gender/role
        writeFileSync(f, JSON.stringify(all, null, 2), 'utf8')
      } catch { /* 记不上不影响改备注 */ }
      bridge.identityClear(uid)
      return { ok: true, detail: '已把 ' + uid + ' 的备注改成「' + remark + '」，并记住这个身份' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_report_identity',
    description: '身份核验失败或可疑时，把对方 QQ 和自称的身份上报给主人，等主人判断。',
    parameters: {
      user_id: { type: 'string', description: '对方 QQ 号' },
      claimed: { type: 'string', description: '对方自称的身份' },
      reason: { type: 'string', description: '为什么觉得可疑' },
    },
    output: out,
    async execute(args) {
      const uid = String(args.user_id ?? '').replace(/\D/g, '')
      const claimed = String(args.claimed ?? '').trim() || '（没说清）'
      const reason = String(args.reason ?? '').trim()
      const owner = bridge.ownerQQ()
      const socket = bridge.server.currentSocket()
      if (!owner || !socket) return { ok: false, detail: '现在没法联系主人' }
      const text = '主人，有人加我好友，身份我判断不了：\n- QQ：' + uid + '\n- 自称：' + claimed + (reason ? '\n- 疑点：' + reason : '') + '\n你确认一下他是谁，我再改备注喵。'
      await bridge.server.sendText(socket, 'private', Number(owner), text)
      const all = bridge.identityAll()
      if (all[uid]) { all[uid].escalated = true; all[uid].claims = [...(all[uid].claims || []), claimed]; bridge.identitySave(all) }
      return { ok: true, detail: '已经把 ' + uid + '（自称' + claimed + '）上报给主人' }
    },
  }))
}
