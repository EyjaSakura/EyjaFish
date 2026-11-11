import { createHash } from 'node:crypto'
// 自动抽取自 bridge.js #registerSelfTools
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export function register({ agentCtx, route, key, role, bridge, defineTool, debugLog, call, out, uid, isAdmin }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_face_qq_list',
    description: '列出 QQ 账号自己表情收藏里的表情（QQ 原生收藏，不是本地库）。',
    parameters: {},
    output: out,
    async execute() {
      const socket = bridge.server.currentSocket()
      if (!socket) return { ok: false, detail: 'QQ 没连上' }
      const data = await bridge.server.action(socket, 'fetch_custom_face_detail', { count: 50 })
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.emojiInfoList) ? data.emojiInfoList : [])
      if (list.length === 0) return { ok: true, detail: 'QQ 表情收藏是空的' }
      const lib = bridge.faces // [fav-desc-local]
      const urlMd5Cache = {} // [fav-url-match] url -> md5
      const findLocal = (e, md5) => {
        const rid = String(e.resId || e.res_id || '')
        const qm = String(e.md5 || '')
        const url = String(e.url || '')
        let hit = lib.items.find((it) => (url && it.qqUrl === url) || (md5 && it.md5 === md5) || (qm && it.md5 === qm) || (rid && it.qqResId === rid))
        if (!hit && url) {
          try { if (!urlMd5Cache[url]) { /* 现算 */ } } catch { /* ignore */ }
        }
        return hit || null
      }
      const lines = []
      for (let i = 0; i < list.length; i += 1) {
        const e = list[i]
        let md5 = ''
        const url = String(e.url || '')
        if (url) {
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
            const buf = Buffer.from(await r.arrayBuffer())
            md5 = createHash('md5').update(buf).digest('hex')
            urlMd5Cache[url] = md5
          } catch { md5 = '' }
        }
        const hit = findLocal(e, md5)
        const label = hit && hit.desc ? hit.desc : '表情'
        lines.push((i + 1) + '. ' + label + (hit && hit.desc ? '' : '（无描述）'))
      }
      return { ok: true, detail: 'QQ 表情收藏（' + list.length + ' 个）：\n' + lines.join('\n') }
    },
  }))

  // [face-autotag 2026-10-31] 给 QQ 收藏里没描述的表情自动补描述：下载 → 百炼 qwen3-vl-plus 看图 → 入库
  agentCtx.tools.register(defineTool({
    name: 'qq_face_qq_autotag',
    description: '给 QQ 收藏里还没描述的表情自动补描述（用百炼看图）。只有主人能要求。',
    parameters: {},
    output: out,
    async execute() {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const socket = bridge.server.currentSocket()
      if (!socket) return { ok: false, detail: 'QQ 没连上' }
      let key = ''
      try {
        const cred = readFileSync(join(process.env.USERPROFILE || 'C:\\Users\\Eyjafjalla', '.dsh', '.credentials.yaml'), 'utf8')
        key = (cred.match(/DASHSCOPE_API_KEY:\s*(\S+)/) || [])[1] || ''
      } catch { /* ignore */ }
      if (!key) return { ok: false, detail: '没读到百炼 key（.dsh/.credentials.yaml）' }
      const data = await bridge.server.action(socket, 'fetch_custom_face_detail', { count: 100 })
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.emojiInfoList) ? data.emojiInfoList : [])
      if (list.length === 0) return { ok: true, detail: 'QQ 表情收藏是空的' }
      const lib = bridge.faces
      const hasDesc = (e, md5) => lib.items.some((it) => it.desc && ((it.qqUrl && it.qqUrl === String(e.url || '')) || (md5 && it.md5 === md5) || (it.qqResId && it.qqResId === String(e.resId || e.res_id || ''))))
      let added = 0
      const failed = []
      for (const e of list) {
        const url = String(e.url || '')
        if (!url) continue
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
          if (!r.ok) throw new Error('download HTTP ' + r.status)
          const buf = Buffer.from(await r.arrayBuffer())
          const md5 = createHash('md5').update(buf).digest('hex')
          if (hasDesc(e, md5)) continue
          const mime = /\.gif/i.test(url) ? 'image/gif' : /\.(jpg|jpeg)/i.test(url) ? 'image/jpeg' : 'image/png'
          const body = {
            model: 'qwen3-vl-plus',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: '这是聊天里用的表情包。用一句中文（10~30字）描述：画面里是什么 + 传达的情绪或使用场景。只输出这一句，不要引号、不要解释。' },
                { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + buf.toString('base64') } },
              ],
            }],
            max_tokens: 120,
          }
          const ar = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60000),
          })
          if (!ar.ok) throw new Error('vision HTTP ' + ar.status)
          const aj = await ar.json()
          const desc = String(aj.choices?.[0]?.message?.content ?? '').trim().replace(/^[「"'“]|[」"'”]$/g, '').replace(/\s+/g, ' ').slice(0, 30)
          if (!desc) throw new Error('empty desc')
          const saved = await lib.addRemoteImage(url, 'QQ收藏' + String(e.emojiId || md5.slice(0, 6)))
          const item = lib.items.find((it) => it.id === saved.id)
          if (item) {
            item.desc = desc
            item.md5 = md5
            item.qqUrl = url
            item.qqResId = String(e.resId || e.res_id || '')
            if (e.md5) item.qqMd5 = String(e.md5)
            lib.save()
          }
          added += 1
        } catch (error) {
          failed.push((e.emojiId || '?') + ': ' + error.message)
        }
      }
      return { ok: true, detail: '补完 ' + added + ' 张' + (failed.length ? '；失败 ' + failed.length + '：' + failed.slice(0, 3).join(' | ') : '') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_face_qq_send',
    description: '把 QQ 自己表情收藏里的第 N 个（或名字包含 desc 的那个）发到当前聊天。这是原生表情消息。',
    parameters: {
      index: { type: 'number', description: '序号，从 1 开始（见 qq_face_qq_list）' },
      desc: { type: 'string', description: '可选：按备注/名字模糊匹配，优先于序号' },
    },
    output: out,
    async execute(args) {
      const socket = bridge.server.currentSocket()
      if (!socket) return { ok: false, detail: 'QQ 没连上' }
      const data = await bridge.server.action(socket, 'fetch_custom_face_detail', { count: 50 })
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.emojiInfoList) ? data.emojiInfoList : [])
      if (list.length === 0) return { ok: false, detail: 'QQ 表情收藏是空的' }
      const want = String(args.desc ?? '').trim()
      let pick = null
      if (want) pick = list.find((e) => String(e.desc || '').includes(want))
      if (!pick) {
        const idx = Math.max(1, Math.min(list.length, Number(args.index) || 1))
        pick = list[idx - 1]
      }
      if (!pick || !pick.url) return { ok: false, detail: '没找到这个表情' }
      await bridge.server.sendSegments(route.bot, route.messageType, route.targetId, [{ type: 'image', data: { file: pick.url, sub_type: 1 } }])
      return { ok: true, detail: '已发送 QQ 收藏表情：' + (pick.desc || pick.emojiId || '未命名') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_face_prune',
    description: '删除收藏里所有没有描述的表情（不可恢复；删除前会先报数量）。',
    parameters: {},
    output: out,
    async execute() {
      const lib = bridge.faces
      const dead = lib.items.filter((i) => !i.desc)
      if (dead.length === 0) return { ok: true, detail: '没有缺描述的表情，不用清理' }
      for (const item of dead) { try { unlinkSync(item.file) } catch { /* ignore */ } }
      lib.items = lib.items.filter((i) => i.desc)
      lib.save()
      return { ok: true, detail: '已删除 ' + dead.length + ' 张缺描述的表情，剩 ' + lib.items.length + ' 张' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_face_tag',
    description: '给表情记描述或修改描述。别人告诉你某张表情的真实意思时用它改；不填名字默认最近收到的那张；引用一张图时说 from_quote 就改那张。',
    parameters: {
      name: { type: 'string', description: '可选：表情名字；不填用最近收到的一张' },
      desc: { type: 'string', description: '一句话描述：画面内容 + 情绪/用途，10~30 字' },
      from_quote: { type: 'boolean', description: '可选：修改用户引用的那张表情的描述' },
    },
    output: out,
    async execute(args) {
      const raw = String(args.name ?? '').trim() || String(bridge.lastStickerName ?? '')
      const desc = String(args.desc ?? '').trim()
      debugLog('[tag-debug] name=' + raw + ' from_quote=' + String(args.from_quote === true) + ' desc=' + desc.slice(0, 30)) // [tag-debug]
      if (!raw) throw new Error('没有可描述的表情')
      if (!desc) throw new Error('描述不能为空')
      const lib = bridge.faces
      let item = null
      if (args.from_quote === true && bridge.lastQuotedStickerName) { // [sticker-msg-map]
        item = lib.items.find((i) => i.name === bridge.lastQuotedStickerName) || null
      } else if (args.from_quote === true) { // [tag-quote] 按引用图改描述
        const qurl = (bridge.lastQuotedImages || [])[0]
        if (!qurl) throw new Error('没有可用的引用图片')
        try {
          const r = await fetch(qurl, { signal: AbortSignal.timeout(10000) })
          const qmd5 = createHash('md5').update(Buffer.from(await r.arrayBuffer())).digest('hex')
          item = lib.items.find((i) => i.md5 === qmd5) || null
        } catch { /* ignore */ }
        if (!item && raw) { // [tag-debug] 引用图匹配失败：退回按名字/描述关键词
          item = lib.items.find((i) => i.name === raw || String(i.desc || '').includes(raw)) || null
        }
        if (!item) throw new Error('本地库里没有这张引用的图（可用名字或描述关键词指定）')
      } else {
        item = lib.items.find((i) => i.name === raw || i.id === raw) || null
        if (!item) item = lib.items.find((i) => i.name === '表情' + raw || i.name.endsWith(raw) || String(i.desc || '').includes(raw)) || null
        if (!item) throw new Error('没有这个收藏表情：' + raw)
      }
      item.desc = desc.slice(0, 60)
      if (item.pendingDesc || !item.qqResId) { item.pendingDesc = false; void bridge.saveFaceToQq(item) } // [tag-save-fix2] 没收藏过就补存
      lib.save()
      // [fav-desc-local] 描述只存本地，不写 QQ 备注
      debugLog('[tag-debug] updated ' + item.name)
      return { ok: true, detail: '已更新描述：「' + item.name + '」= ' + item.desc }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_face_send_to',
    description: '把本地表情库里的一张表情发给另一个白名单好友（按名字或描述关键词找，不需要路径）。只有主人能要求。',
    parameters: {
      user_id: { type: 'string', description: '对方 QQ 号（必须在白名单内）' },
      name: { type: 'string', description: '表情名字或描述关键词，例如"凶巴巴"、"0fa1"' },
      text: { type: 'string', description: '可选：随图附一句话' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const to = String(args.user_id ?? '').replace(/\D/g, '')
      const key = String(args.name ?? '').trim()
      if (!to || !key) throw new Error('需要 user_id 和 name')
      const allow = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String)
      if (!allow.includes(to)) return { ok: false, detail: to + ' 不在白名单里' }
      const lib = bridge.faces
      const item = lib.items.find((i) => i.name === key || i.id === key)
        || lib.items.find((i) => i.name.endsWith(key) || String(i.desc || '').includes(key))
        || null
      if (!item) return { ok: false, detail: '本地库里没找到「' + key + '」，先用 qq_face_list 看看' }
      const socket = bridge.server.currentSocket()
      if (!socket) return { ok: false, detail: 'QQ 没连上' }
      await bridge.sendImageTo({ bot: socket, messageType: 'private', targetId: Number(to) }, item.file, String(args.text ?? ''))
      bridge.linkLastSticker('u:' + to, item.name) // [sticker-msg-map]
      try { bridge.recordMemory('u:' + to, 'assistant', String(args.text ?? '') || '[图片]') } catch { /* ignore */ }
      return { ok: true, detail: '已把「' + item.name + '」发给 ' + to }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_face_delete',
    description: '删除表情。默认同时删本地库和 QQ 收藏；可按名字、引用图（from_quote）指定。只有主人能要求。',
    parameters: {
      name: { type: 'string', description: '可选：表情名字或描述关键词' },
      from_quote: { type: 'boolean', description: '可选：删除用户引用的那张图' },
      target: { type: 'string', description: '可选：both（默认）/ library / favorite' },
    },
    output: out,
    async execute(args) {
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const lib = bridge.faces
      const target = String(args.target ?? 'both')
      let qmd5 = ''
      if (args.from_quote === true) {
        const qurl = (bridge.lastQuotedImages || [])[0]
        if (!qurl) return { ok: false, detail: '没有可用的引用图片' }
        try { const r = await fetch(qurl, { signal: AbortSignal.timeout(10000) }); qmd5 = createHash('md5').update(Buffer.from(await r.arrayBuffer())).digest('hex') } catch { /* ignore */ }
      }
      const raw = String(args.name ?? '').trim()
      let item = null
      if (args.from_quote === true && bridge.lastQuotedStickerName) { // [sticker-msg-map]
        item = lib.items.find((it) => it.name === bridge.lastQuotedStickerName) || null
      }
      if (!item && qmd5) item = lib.items.find((it) => it.md5 === qmd5) || null
      if (!item && raw) item = lib.items.find((it) => it.name === raw || it.id === raw) || lib.items.find((it) => it.name === '表情' + raw || it.name.endsWith(raw) || String(it.desc || '').includes(raw)) || null
      const socket = bridge.server.currentSocket()
      let delLocal = 0
      let delFav = 0
      if (target !== 'favorite' && item) {
        try { unlinkSync(item.file) } catch { /* ignore */ }
        lib.items = lib.items.filter((it) => it !== item)
        lib.save()
        delLocal = 1
      }
      if (target !== 'library' && socket) {
        let rid = item && item.qqResId ? String(item.qqResId) : ''
        if (!rid) {
          try {
            const data = await bridge.server.action(socket, 'fetch_custom_face_detail', { count: 100 })
            const list = Array.isArray(data) ? data : (data && Array.isArray(data.emojiInfoList) ? data.emojiInfoList : [])
            let hit = list.find((e) => qmd5 && String(e.md5 || '') === qmd5) || (item && list.find((e) => item.qqUrl && String(e.url || '') === String(item.qqUrl))) || null
            if (!hit && item && item.md5) {
              for (const e of list) {
                if (!e.url) continue
                try { const rr = await fetch(String(e.url), { signal: AbortSignal.timeout(8000) }); if (createHash('md5').update(Buffer.from(await rr.arrayBuffer())).digest('hex') === item.md5) { hit = e; break } } catch { /* skip */ }
              }
            }
            if (hit) rid = String(hit.resId || hit.res_id || '')
          } catch { /* ignore */ }
        }
        if (rid) {
          try {
            const rr = await bridge.gate.run('delete_custom_face', 'u:' + String(route?.targetId ?? ''), 'delete_custom_face', () => bridge.server.action(socket, 'delete_custom_face', { res_id: rid }))
            if (rr.ok) delFav = 1
          } catch { /* ignore */ }
        }
      }
      const parts = []
      if (delLocal) parts.push('本地库')
      if (delFav) parts.push('QQ 收藏')
      if (parts.length === 0) return { ok: false, detail: '没找到可删的表情（本地和收藏都没有匹配）' }
      return { ok: true, detail: '已从' + parts.join('和') + '删除' }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_face_last',
    description: '查看"最近收到的那张表情"：落库名字、内容 MD5 前 8 位、以及是否和库里已有的一张重复（撞了哪张）。',
    parameters: {},
    output: out,
    async execute() {
      const last = bridge.lastSticker
      if (!last) return { ok: true, detail: '最近还没收到过表情' }
      const lib = bridge.faces
      const same = last.md5 ? lib.items.filter((i) => i.md5 === last.md5).map((i) => i.name) : []
      const lines = [
        '最近收到：' + last.name,
        'MD5：' + (last.md5 ? last.md5.slice(0, 8) : '（未记录）'),
        last.file ? '文件：' + last.file : '',
        last.duplicate ? '结果：与库里已有内容重复，复用了原条目' : '结果：新入库',
        same.length > 1 ? '同内容的条目：' + same.join('、') : '',
        '库内共 ' + lib.items.length + ' 张',
      ].filter(Boolean)
      return { ok: true, detail: lines.join('\n') }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_face_save_qq',
    description: '把一个已收藏的图片表情存进 QQ 自己的表情收藏（存完在任何聊天里都能直接选用）。不填名字时用"最近收到的那张"。',
    parameters: { name: { type: 'string', description: '可选：收藏表情的名字；不填则用最近收到的一张' } },
    output: out,
    async execute(args) {
      const raw = String(args.name ?? '').trim() || String(bridge.lastStickerName ?? '')
      if (!raw) throw new Error('没有可保存的表情：先让对方发一张，或告诉我名字')
      const lib = bridge.faces
      let item = lib.items.find((i) => i.name === raw || i.id === raw)
      if (!item) item = lib.items.find((i) => i.name === '表情' + raw || i.name.endsWith(raw))
      if (!item) throw new Error('没有这个收藏表情：' + raw + '（先用 qq_face_list 看看）')
      // add_custom_face 只认本地路径（且 NapCat 在 WSL 里），先落到 WSL 的 /tmp 再传 Linux 路径
      const ext = (item.file.match(/\.[a-z0-9]+$/i) || ['.png'])[0]
      const dirWin = '\\\\wsl.localhost\\Ubuntu\\tmp\\qq-customface'
      const dirLinux = '/tmp/qq-customface'
      try { mkdirSync(dirWin, { recursive: true }) } catch { /* 目录已存在 */ }
      const fileName = 'face-' + Date.now().toString(36) + ext
      writeFileSync(dirWin + '\\' + fileName, readFileSync(item.file))
      debugLog('[save-qq] manual save ' + item.name + ' file=' + item.file)
      const r = await bridge.gate.run('add_custom_face', 'u:' + String(route?.targetId ?? ''), 'add_custom_face', () => bridge.server.action(bridge.server.currentSocket(), 'add_custom_face', { file: dirLinux + '/' + fileName, is_origin: true, md5: item.md5 || undefined }))
      if (!r.ok) throw new Error('存进 QQ 收藏失败：' + r.reason)
      return { ok: true, detail: '已存进 QQ 表情收藏：「' + item.name + '」' }
    },
  }))
}
