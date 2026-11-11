import { createHash } from 'node:crypto'
// 自动抽取自 bridge.js #registerSelfTools
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export function register({ agentCtx, route, key, role, bridge, defineTool, debugLog, call, out, uid, isAdmin }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_hot_bili',
    description: '看 B 站热门视频榜（标题、UP、播放、链接）或 B 站热搜词。注意：只能看到标题/数据，看不到视频画面。',
    parameters: {
      limit: { type: 'number', description: '可选：取几条，默认 8，最多 15' },
      keyword: { type: 'string', description: '可选：想搜的关键词；不填就取热门榜' },
    },
    output: out,
    async execute(args) {
      const limit = Math.max(1, Math.min(15, Number(args.limit) || 8))
      const kw = String(args.keyword ?? '').trim()
      if (kw) return { ok: true, detail: 'B 站搜索「' + kw + '」：\nhttps://search.bilibili.com/all?keyword=' + encodeURIComponent(kw) + '\n（搜索接口要签名，先给链接；要标题就让我看热门榜）' }
      const r = await fetch('https://api.bilibili.com/x/web-interface/popular?ps=' + limit + '&pn=1', { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(15000) })
      const j = await r.json()
      if (!j || j.code !== 0) throw new Error('B 站热门拉取失败：' + (j && j.message))
      const list = (j.data && j.data.list) || []
      const lines = list.slice(0, limit).map((v, i) => (i + 1) + '. ' + v.title + ' — ' + (v.owner && v.owner.name) + ' · ' + (v.stat && v.stat.view) + ' 播放\n   https://www.bilibili.com/video/' + v.bvid)
      return { ok: true, detail: 'B 站热门（' + list.length + '）：\n' + lines.join('\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_hot_douyin',
    description: '看抖音热榜（热词/话题，带搜索链接）。只能看到热词，看不到视频画面。',
    parameters: { limit: { type: 'number', description: '可选：取几条，默认 8' } },
    output: out,
    async execute(args) {
      const limit = Math.max(1, Math.min(20, Number(args.limit) || 8))
      const r = await fetch('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' }, signal: AbortSignal.timeout(15000) })
      const j = await r.json()
      const list = (j && j.word_list) || []
      if (list.length === 0) throw new Error('抖音热榜拉取失败')
      const lines = list.slice(0, limit).map((w, i) => (i + 1) + '. ' + w.word + '\n   https://www.douyin.com/search/' + encodeURIComponent(w.word))
      return { ok: true, detail: '抖音热榜（' + list.length + '）：\n' + lines.join('\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'bili_get_profile',
    description: '读取 B 站小号自己的资料：昵称、mid、签名、等级、大会员、实名/手机绑定状态。',
    parameters: {},
    output: out,
    async execute() {
      const sess = String(bridge.config.biliSessdata || '').trim()
      if (!sess) return { ok: false, detail: '没有配置 B 站 SESSDATA' }
      const H = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', referer: 'https://www.bilibili.com/', cookie: 'SESSDATA=' + sess }
      const acc = await (await fetch('https://api.bilibili.com/x/member/web/account', { headers: H, signal: AbortSignal.timeout(15000) })).json()
      if (!acc || acc.code !== 0) return { ok: false, detail: '读取失败（cookie 可能过期）：' + ((acc && acc.message) || acc.code) }
      const d = acc.data || {}
      let extra = ''
      try {
        const my = await (await fetch('https://api.bilibili.com/x/space/myinfo', { headers: H, signal: AbortSignal.timeout(15000) })).json()
        if (my && my.code === 0 && my.data) {
          const m = my.data
          extra = '\n等级：' + (m.level ?? '?') + '　硬币：' + (m.coins ?? '?') + '　关注/粉丝：' + (m.friend ?? '?') + '/' + (m.follower ?? '?')
          extra += '\n头像：' + (m.face || '（无）') + (String(m.face || '').includes('noface') ? '（默认头像）' : '')
        }
      } catch { /* ignore */ }
      const lines = [
        '昵称：' + (d.uname || ''),
        'mid：' + (d.mid || ''),
        '签名：' + (d.sign || '（空）'),
        '等级：' + (d.rank || '?'),
      ]
      return { ok: true, detail: lines.join('\n') + extra }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'bili_set_nickname',
    description: '修改 B 站小号的昵称（对外可见）。改完要告诉主人。B 站对昵称有频率限制。',
    parameters: { name: { type: 'string', description: '新昵称，2~20 字' } },
    output: out,
    async execute(args) {
      const name = String(args.name ?? '').trim()
      if (name.length < 1 || name.length > 20) throw new Error('昵称需要 1~20 字')
      const sess = String(bridge.config.biliSessdata || '').trim()
      const jct = String(bridge.config.biliJct || '').trim()
      if (!sess || !jct) return { ok: false, detail: 'B 站登录信息不全（需要 SESSDATA 和 bili_jct）' }
      const body = new URLSearchParams({ uname: name, csrf: jct })
      const r = await bridge.gate.run('bili_set_nickname', key, 'bili_nick', () => fetch('https://api.bilibili.com/x/member/web/update', {
        method: 'POST',
        headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', cookie: 'SESSDATA=' + sess + '; bili_jct=' + jct, 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000),
      }).then((x) => x.json()))
      if (!r.ok) throw new Error('改 B 站昵称被限流：' + r.reason)
      const j = r.value
      if (!j || j.code !== 0) return { ok: false, detail: 'B 站拒绝改昵称：' + ((j && (j.message || j.code)) || '未知错误') }
      void bridge.notifyOwner(route, '（B站昵称改成「' + name + '」了喵）')
      return { ok: true, detail: 'B 站昵称已改为「' + name + '」' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'bili_set_signature',
    description: '修改 B 站小号的个性签名。改完要告诉主人。',
    parameters: { text: { type: 'string', description: '新签名，1~60 字' } },
    output: out,
    async execute(args) {
      const text = String(args.text ?? '').trim()
      if (!text || text.length > 60) throw new Error('签名需要 1~60 字')
      const sess = String(bridge.config.biliSessdata || '').trim()
      const jct = String(bridge.config.biliJct || '').trim()
      if (!sess || !jct) return { ok: false, detail: 'B 站登录信息不全' }
      const body = new URLSearchParams({ user_sign: text, csrf: jct })
      const r = await bridge.gate.run('bili_set_signature', key, 'bili_sign', () => fetch('https://api.bilibili.com/x/member/web/sign/update', {
        method: 'POST',
        headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', cookie: 'SESSDATA=' + sess + '; bili_jct=' + jct, 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000),
      }).then((x) => x.json()))
      if (!r.ok) throw new Error('改 B 站签名被限流：' + r.reason)
      const j = r.value
      if (!j || j.code !== 0) return { ok: false, detail: 'B 站拒绝改签名：' + ((j && (j.message || j.code)) || '未知错误') }
      void bridge.notifyOwner(route, '（B站签名改成「' + text + '」了喵）')
      return { ok: true, detail: 'B 站签名已改为「' + text + '」' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'bili_set_avatar',
    description: '修改 B 站小号的头像（上传本地图片）。路径必须在允许发送的目录内；改完要告诉主人。',
    parameters: { path: { type: 'string', description: '本地图片路径' } },
    output: out,
    async execute(args) {
      const sess = String(bridge.config.biliSessdata || '').trim()
      const jct = String(bridge.config.biliJct || '').trim()
      if (!sess || !jct) return { ok: false, detail: 'B 站登录信息不全' }
      const file = bridge.resolveSendPath(String(args.path ?? ''), role)
      const buf = readFileSync(file)
      const form = new FormData()
      form.append('file', new Blob([buf], { type: 'image/png' }), 'avatar.png')
      form.append('csrf', jct)
      const r = await bridge.gate.run('bili_set_avatar', key, 'bili_avatar', () => fetch('https://api.bilibili.com/x/member/web/face/upload?csrf=' + jct, {
        method: 'POST',
        headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', cookie: 'SESSDATA=' + sess + '; bili_jct=' + jct },
        body: form,
        signal: AbortSignal.timeout(30000),
      }).then(async (x) => {
        const ct = String(x.headers.get('content-type') || '')
        if (!ct.includes('json')) return { html: true, status: x.status }
        return x.json()
      }))
      if (!r.ok) throw new Error('换 B 站头像被限流：' + r.reason)
      const j = r.value
      if (j && j.html) return { ok: false, detail: 'B 站头像接口已变更/被风控（返回网页），暂时改不了头像；可以用 B 站 App 手动换' }
      if (!j || j.code !== 0) return { ok: false, detail: 'B 站拒绝换头像：' + ((j && (j.message || j.code)) || '未知错误') }
      void bridge.notifyOwner(route, '（B站头像换好了喵）')
      return { ok: true, detail: 'B 站头像已更换' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_bili_subtitle',
    description: '按 BV 号读取 B 站视频的 AI/CC 字幕全文（需要登录 cookie）。能知道视频里说了什么，但仍然看不到画面。',
    parameters: {
      bvid: { type: 'string', description: 'BV 号' },
      maxChars: { type: 'number', description: '可选：最多返回多少字，默认 2500' },
    },
    output: out,
    async execute(args) {
      const bvid = String(args.bvid ?? '').trim()
      if (!/^BV[0-9A-Za-z]+$/.test(bvid)) throw new Error('BV 号格式不对')
      const sess = String(bridge.config.biliSessdata || '').trim()
      if (!sess) return { ok: false, detail: '没有配置 B 站 SESSDATA，读不了字幕（只能看标题简介）' }
      const mid = Math.max(200, Math.min(6000, Number(args.maxChars) || 2500))
      const H = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', referer: 'https://www.bilibili.com/', cookie: 'SESSDATA=' + sess }
      const v = await (await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, { headers: H, signal: AbortSignal.timeout(15000) })).json()
      if (!v || v.code !== 0) throw new Error('视频信息拉取失败：' + (v && v.message))
      const aid = v.data.aid, cid = v.data.cid
      const p = await (await fetch('https://api.bilibili.com/x/player/v2?aid=' + aid + '&cid=' + cid, { headers: H, signal: AbortSignal.timeout(15000) })).json()
      const subs = (p && p.data && p.data.subtitle && p.data.subtitle.subtitles) || []
      if (subs.length === 0) return { ok: false, detail: '这个视频没有可读字幕（没开 AI 字幕/CC，或 cookie 失效）' }
      const pick = subs.find((s) => /ai-zh|zh-CN|zh-Hans/i.test(String(s.lan || ''))) || subs[0]
      const url = String(pick.subtitle_url || '').replace(/^\/\//, 'https://')
      const body = await (await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) })).json()
      const lines = (body.body || []).map((x) => String(x.content || '').trim()).filter(Boolean)
      const text = lines.join(' ').replace(/\s+/g, ' ')
      if (!text) return { ok: false, detail: '字幕是空的' }
      return { ok: true, detail: '《' + v.data.title + '》字幕（' + pick.lan_doc + '，' + lines.length + ' 段）：\n' + text.slice(0, mid) + (text.length > mid ? '…（截断）' : '') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_bili_video',
    description: '按 BV 号看一个 B 站视频的标题、简介、UP、播放/点赞。只能看文字信息，看不到画面。',
    parameters: { bvid: { type: 'string', description: 'BV 号，例如 BV1xx411c7mD' } },
    output: out,
    async execute(args) {
      const bvid = String(args.bvid ?? '').trim()
      if (!/^BV[0-9A-Za-z]+$/.test(bvid)) throw new Error('BV 号格式不对')
      const r = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(15000) })
      const j = await r.json()
      if (!j || j.code !== 0) throw new Error('视频信息拉取失败：' + (j && j.message))
      const d = j.data || {}
      return { ok: true, detail: [d.title, 'UP：' + (d.owner && d.owner.name), '播放：' + (d.stat && d.stat.view) + ' · 点赞：' + (d.stat && d.stat.like), '简介：' + String(d.desc || '').slice(0, 200), 'https://www.bilibili.com/video/' + bvid].join('\n') }
    },
  }))
}
