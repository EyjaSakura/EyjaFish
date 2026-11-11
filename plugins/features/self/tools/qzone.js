import { createHash } from 'node:crypto'
// 自动抽取自 bridge.js #registerSelfTools
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export function register({ agentCtx, route, key, role, bridge, defineTool, debugLog, call, out, uid, isAdmin }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_download_image',
    description: '从 http(s) 链接下载一张图片保存到本地（存进你自己目录的 downloads/），之后可以发出去或当头像。只支持图片链接。',
    parameters: {
      url: { type: 'string', description: '图片的 http(s) 地址' },
      name: { type: 'string', description: '可选：保存的文件名（不含扩展名）' },
    },
    output: out,
    async execute(args) {
      if (bridge.config.fsWriteEnabled === false) return { ok: false, detail: '写文件功能已被管理员关闭' }
      const raw = String(args.url ?? '').trim()
      if (!/^https?:\/\//i.test(raw)) throw new Error('只支持 http(s) 链接')
      let u
      try { u = new URL(raw) } catch { throw new Error('链接格式不对') }
      if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|\[::1\])/i.test(u.hostname)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) {
        throw new Error('不允许下载内网地址')
      }
      const res = await fetch(raw, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error('下载失败：HTTP ' + res.status)
      const type = String(res.headers.get('content-type') || '')
      if (!/^image\//i.test(type)) throw new Error('这个链接不是图片（' + (type || '未知类型') + '）')
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 8 * 1024 * 1024) throw new Error('图片太大（>8MB）')
      const ext = (type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png'
      const safe = String(args.name ?? '').replace(/[^\w.\-]/g, '_').slice(0, 40) || ('img-' + Date.now().toString(36))
      const dir = join(role.cwd, 'downloads')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, safe.endsWith('.' + ext) ? safe : safe + '.' + ext)
      writeFileSync(file, buf)
      return { ok: true, detail: '已保存到 ' + file + '（' + Math.round(buf.length / 1024) + ' KB），可以发出去或当头像' }
    },
  }))

  // [qzone-comments] 通过 NapCat get_cookies 拿 qzone cookie+bkn，读写自己的说说
  const zq = async () => {
    const socket = bridge.server.currentSocket()
    if (!socket) throw new Error('QQ 没连上')
    const r = await bridge.server.action(socket, 'get_cookies', { domain: 'qzone.qq.com' })
    const cookies = String((r && (r.cookies || r.data?.cookies)) || '')
    const bkn = String((r && (r.bkn || r.data?.bkn)) || '')
    if (!cookies || !bkn) throw new Error('拿不到 QQ 空间 cookie/bkn（可能未登录或 NapCat 不支持）')
    const uin = (cookies.match(/(?:^|;\s*)uin=o?(\d+)/) || [])[1] || ''
    if (!uin) throw new Error('cookie 里没有 uin')
    return { socket, cookies, bkn, uin }
  }
  const zqHeaders = (cookies, uin) => ({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', referer: 'https://user.qzone.qq.com/' + uin, cookie: cookies })

  agentCtx.tools.register(defineTool({
    name: 'qq_qzone_daily_diary',
    description: '设置"每天固定时间发一条说说（日记）"。设置后每天到点会提醒你，想发就发。只有主人能要求。',
    parameters: {
      hour: { type: 'number', description: '小时（0~23），例如 9 表示每天 9 点' },
      enable: { type: 'boolean', description: '可选：false 表示取消每日日记' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const file = join(bridge.memoryDir, '..', 'qq-qzone-autopost.json')
      if (args.enable === false) {
        writeFileSync(file, JSON.stringify({ mode: 'random', nextAt: 0 }, null, 2), 'utf8')
        return { ok: true, detail: '已取消每日日记，改回随机提醒' }
      }
      const hh = Math.max(0, Math.min(23, Number(args.hour)))
      if (!Number.isFinite(hh)) throw new Error('hour 需要 0~23')
      writeFileSync(file, JSON.stringify({ mode: 'daily', hour: Math.round(hh), lastDate: '' }, null, 2), 'utf8')
      return { ok: true, detail: '已设好：每天 ' + Math.round(hh) + ' 点记日记（// [no-report]）' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_qzone_list',
    description: '读自己 QQ 空间的说说列表（含评论）：tid、内容、时间、评论人和评论 tid。用来找要删的说说或要回复的评论。',
    parameters: { limit: { type: 'number', description: '可选：几条，默认 5，最多 20' } },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const n = Math.max(1, Math.min(20, Number(args.limit) || 5))
      const { cookies, bkn, uin } = await zq()
      const url = 'https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin=' + uin + '&ftype=0&sort=0&pos=0&num=' + n + '&replynum=50&g_tk=' + bkn + '&code=0&format=json&inCharset=utf-8&outCharset=utf-8&ref=feeds&qzonetoken=&callback=&_=' + Date.now()
      const resp = await fetch(url, { headers: zqHeaders(cookies, uin), signal: AbortSignal.timeout(20000) })
      const raw = await resp.text()
      let j = null
      try {
        // 空间接口返回 JSONP：_Callback({...}); 先剥壳
        const t = raw.trim()
        const jsonText = t.startsWith('{') ? t : t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'))
        j = JSON.parse(jsonText)
      } catch { return { ok: false, detail: '空间返回内容解析失败（可能是风控页），已记录日志' } }
      if (!j || j.code !== 0) return { ok: false, detail: '拉取说说失败：' + ((j && (j.message || j.code)) || '未知') }
      const list = j.msglist || []
      if (list.length === 0) return { ok: true, detail: '空间里没有说说' }
      const blocks = list.map((m, i) => {
        const when = m.created_time ? new Date(m.created_time * 1000).toLocaleString() : ''
        const cs = (m.commentlist || []).map((c) => '   - [' + (c.nickname || c.uin) + '] ' + String(c.content || '').slice(0, 40) + '  (comment_tid=' + c.tid + ')').join('\n')
        return (i + 1) + '. tid=' + m.tid + '  ' + when + '\n   ' + String(m.content || '').slice(0, 80) + (cs ? '\n   评论：\n' + cs : '\n   （无评论）')
      })
      return { ok: true, detail: '最近 ' + list.length + ' 条说说：\n' + blocks.join('\n\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_qzone_reply_comment',
    description: '回复自己说说下面的一条评论（需要 topic tid 和 comment_tid，可从 qq_qzone_list 拿到）。只有主人能要求。',
    parameters: {
      tid: { type: 'string', description: '说说的 tid' },
      comment_tid: { type: 'string', description: '评论的 tid' },
      content: { type: 'string', description: '回复内容' },
      reply_uin: { type: 'string', description: '可选：被回复评论的作者 QQ（不填则自动查）' },
      reply_nick: { type: 'string', description: '可选：被回复评论的昵称' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const tid = String(args.tid ?? '').trim()
      const ctid = String(args.comment_tid ?? '').trim()
      const content = String(args.content ?? '').trim()
      if (!tid || !ctid || !content) throw new Error('需要 tid、comment_tid 和 content')
      const { cookies, bkn, uin } = await zq()
      // [qzone-reply-pc] PC 代理：topicId 不带 __，用 commentId/replyUin/commentUin + @提及
      let targetUin = String(args.reply_uin ?? '').trim()
      let targetNick = String(args.reply_nick ?? '').trim()
      let parentUin = ''
      try {
        const { list } = await bridge.qzoneFetchList(10)
        const post = list.find((p) => String(p.tid) === tid)
        const c = (post?.commentlist || []).find((x) => String(x.tid) === ctid)
        if (c) {
          parentUin = String(c.uin || '')
          // 楼中楼：没显式给被回复者时，优先取这条评论下"非我"的子回复作者，否则会变成自己回自己
          if (!targetUin) {
            const sub = (c.list_3 || []).find((x) => String(x.uin || '') && String(x.uin) !== String(uin))
            targetUin = String(sub?.uin || parentUin)
            if (!targetNick) targetNick = String(sub?.name || c.name || '')
          }
          if (!targetNick) targetNick = String(c.name || '')
        }
      } catch { /* 查不到就用传入值 */ }
      const mention = targetUin ? '@{uin:' + targetUin + ',nick:' + (targetNick || targetUin) + ',auto:1} ' : ''
      const body = new URLSearchParams({
        hostUin: uin, topicId: uin + '_' + tid, content: mention + content,
        format: 'json', qzreferrer: 'https://user.qzone.qq.com/' + uin + '/main',
        // [qzone-nested 2026-10-30] commentId 是父评论，commentUin 必须是**父评论作者**：
        // 以前 replyUin/commentUin 都填被回复者，接口一律回"使用人数过多，请稍后再试"，楼中楼永远发不出去
        commentId: ctid, replyUin: targetUin || uin, commentUin: parentUin || targetUin || uin,
      })
      const j = await bridge.qzoneRequest('https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds?g_tk=' + bkn, {
        method: 'POST', headers: { ...zqHeaders(cookies, uin), 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20000),
      })
      if (!j || j.code !== 0) return { ok: false, detail: '回复失败：' + ((j && (j.message || j.code)) || '未知') }
      return { ok: true, detail: '已回复评论 ' + ctid + '：' + content.slice(0, 40) }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_qzone_delete_comment',
    description: '删除自己说说下的一条评论（按 topic tid + comment_tid）。只有主人能要求；会尝试多个已知端点。',
    parameters: {
      tid: { type: 'string', description: '说说的 tid' },
      comment_tid: { type: 'string', description: '评论的 tid' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const tid = String(args.tid ?? '').trim()
      const ctid = String(args.comment_tid ?? '').trim()
      if (!tid || !ctid) throw new Error('需要 tid 和 comment_tid')
      const { cookies, bkn, uin } = await zq()
      const base = { topicId: uin + '_' + tid, commentId: ctid, uin, hostUin: uin, format: 'json', ref: 'feeds', plat: 'qzone' }
      const urls = [
        'https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delcomment?g_tk=' + bkn,
        'https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delcomment_v6?g_tk=' + bkn,
        'https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delcomment?g_tk=' + bkn,
      ]
      const results = []
      for (const url of urls) {
        try {
          const body = new URLSearchParams(base)
          const r = await fetch(url, { method: 'POST', headers: { ...zqHeaders(cookies, uin), 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) })
          const text = await r.text()
          const head = text.slice(0, 160).replace(/\s+/g, ' ')
          debugLog('[qzone-delcomment] ' + url.split('/cgi-bin/')[1].split('?')[0] + ' -> ' + r.status + ' ' + head)
          let j = null
          try { const t = text.trim(); j = JSON.parse(t.startsWith('{') ? t : t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'))) } catch { j = null }
          results.push(url.split('/cgi-bin/')[1].split('?')[0] + ': ' + (j ? ('code=' + j.code + ' ' + (j.message || '')) : '非 JSON'))
          if (j && j.code === 0) return { ok: true, detail: '已删除评论 ' + ctid + '（' + url.split('/cgi-bin/')[1].split('?')[0] + '）' }
        } catch (error) {
          results.push(url.split('/cgi-bin/')[1].split('?')[0] + ': ' + error.message)
        }
      }
      return { ok: false, detail: '删除失败，尝试结果：\n' + results.join('\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_qzone_comment',
    description: '在自己说说的评论区发一条评论（不针对某条评论）。只有主人能要求。',
    parameters: {
      tid: { type: 'string', description: '说说的 tid' },
      content: { type: 'string', description: '评论内容' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const tid = String(args.tid ?? '').trim()
      const content = String(args.content ?? '').trim()
      if (!tid || !content) throw new Error('需要 tid 和 content')
      const { cookies, bkn, uin } = await zq()
      const body = new URLSearchParams({
        topicId: uin + '_' + tid + '__1',
        content, uin, hostUin: uin, format: 'json', plat: 'qzone',
        inCharset: 'utf-8', outCharset: 'utf-8', ref: 'feeds', ifttype: '0',
      })
      const j = await (await fetch('https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds?g_tk=' + bkn, {
        method: 'POST', headers: { ...zqHeaders(cookies, uin), 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20000),
      })).json()
      if (!j || j.code !== 0) return { ok: false, detail: '评论失败：' + ((j && (j.message || j.code)) || '未知') }
      return { ok: true, detail: '已在说说 ' + tid + ' 下发评论：' + content.slice(0, 40) }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_qzone_posts',
    description: '列出她最近发过的 QQ 空间说说（本地记录：tid、内容、时间），用于之后删除或回顾。',
    parameters: { limit: { type: 'number', description: '可选：最多几条，默认 10' } },
    output: out,
    async execute(args) {
      const limit = Math.max(1, Math.min(30, Number(args.limit) || 10))
      let all = []
      try { all = JSON.parse(readFileSync(join(bridge.memoryDir, '..', 'qq-qzone-posts.json'), 'utf8')) } catch { all = [] }
      if (all.length === 0) return { ok: true, detail: '本地还没有记录到发过的说说' }
      const lines = all.slice(-limit).reverse().map((x, i) => (i + 1) + '. [' + new Date(x.at).toLocaleString() + '] tid=' + x.tid + '\n   ' + x.content.slice(0, 80))
      return { ok: true, detail: '发过的说说（最近 ' + Math.min(limit, all.length) + ' 条）：\n' + lines.join('\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_delete_qzone',
    description: '删除一条自己发过的 QQ 空间说说（按 tid）。',
    parameters: { tid: { type: 'string', description: '说说 tid' } },
    output: out,
    async execute(args) {
      if (!bridge.selfKindEnabled('qzone')) return { ok: false, detail: '发空间功能已被管理员关闭' }
      // [qzone-owner] 只有主人能要求
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const tid = String(args.tid ?? '').trim()
      if (!tid) throw new Error('缺少 tid')
      const r = await bridge.gate.run('delete_qzone_msg', key, 'del_qzone', () => call('delete_qzone_msg', { tid }))
      if (!r.ok) throw new Error('删说说被限流：' + r.reason)
      return { ok: true, detail: '已删除说说 ' + tid }
    },
  }))
}
