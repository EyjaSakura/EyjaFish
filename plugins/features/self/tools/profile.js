import { createHash } from 'node:crypto'
// 自动抽取自 bridge.js #registerSelfTools
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export function register({ agentCtx, route, key, role, bridge, defineTool, debugLog, call, out, uid, isAdmin }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_set_nickname',
    description: '修改机器人自己的 QQ 昵称（对外可见）。改完要马上告诉主人改成了什么。',
    parameters: { nickname: { type: 'string', description: '新昵称，2~20 字' } },
    output: out,
    async execute(args) {
      if (!bridge.selfKindEnabled('profile')) return { ok: false, detail: '改资料功能已被管理员关闭' }
      const nickname = String(args.nickname ?? '').trim()
      if (nickname.length < 1 || nickname.length > 20) throw new Error('昵称需要 1~20 字')
      const r = await bridge.gate.run('set_qq_profile', key, 'set_nickname', () => call('set_qq_profile', { nickname }))
      if (!r.ok) throw new Error('改昵称被限流：' + r.reason)
      const detail = '昵称已改为「' + nickname + '」'
      void bridge.notifyOwner(route, '（改好了喵：' + detail + '）')
      return { ok: true, detail }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_set_signature',
    description: '修改机器人自己的 QQ 个性签名（对外可见）。改完要马上告诉主人。',
    parameters: { text: { type: 'string', description: '新签名，1~80 字' } },
    output: out,
    async execute(args) {
      if (!bridge.selfKindEnabled('profile')) return { ok: false, detail: '改资料功能已被管理员关闭' }
      const text = String(args.text ?? '').trim()
      if (!text || text.length > 80) throw new Error('签名需要 1~80 字')
      const r = await bridge.gate.run('set_self_longnick', key, 'set_signature', () => call('set_self_longnick', { longNick: text }))
      if (!r.ok) throw new Error('改签名被限流：' + r.reason)
      const detail = '个性签名已改为「' + text + '」'
      void bridge.notifyOwner(route, '（改好了喵：' + detail + '）')
      return { ok: true, detail }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_set_avatar',
    description: '修改机器人自己的 QQ 头像（对外可见）。路径必须在允许发送的目录内；改完要马上告诉主人。',
    parameters: { path: { type: 'string', description: '本地图片路径（绝对或相对工作目录）' } },
    output: out,
    async execute(args) {
      if (!bridge.selfKindEnabled('profile')) return { ok: false, detail: '改资料功能已被管理员关闭' }
      const file = bridge.resolveSendPath(String(args.path ?? ''), role)
      const b64 = readFileSync(file).toString('base64')
      const r = await bridge.gate.run('set_qq_avatar', key, 'set_avatar', () => call('set_qq_avatar', { file: 'base64://' + b64 }))
      if (!r.ok) throw new Error('换头像被限流：' + r.reason)
      const detail = '头像已更换（' + basename(file) + '）'
      void bridge.notifyOwner(route, '（换好啦喵：' + detail + '）')
      return { ok: true, detail }
    },
  }))

  agentCtx.tools.register(defineTool({
    name: 'qq_post_qzone',
    description: '发一条 QQ 空间说说（对外可见，好友能看到）。可以只发文字，也可以带 1~3 张图。像写日记一样，短、具体。',
    parameters: {
      content: { type: 'string', description: '说说正文' },
      images: { type: 'array', items: { type: 'string' }, description: '可选：图片路径数组（1~3 张）' },
    },
    output: out,
    async execute(args) {
      if (!bridge.selfKindEnabled('qzone')) return { ok: false, detail: '发空间功能已被管理员关闭' }
      // [qzone-owner] 只有主人能要求；其他人要求一律拒绝
      if (String(route?.targetId ?? '') !== bridge.ownerQQ()) return { ok: false, detail: '不是主人，不干' }
      const content = String(args.content ?? '').trim()
      if (!content) throw new Error('说说正文不能为空')
      const max = Number(bridge.config.qzoneMaxChars) || 220
      if (content.length > max) throw new Error('说说太长（上限 ' + max + ' 字）')
      const paths = Array.isArray(args.images) ? args.images.slice(0, 3) : []
      const images = []
      for (const p of paths) {
        const f = bridge.resolveSendPath(String(p), role)
        images.push('base64://' + readFileSync(f).toString('base64'))
      }
      const r = await bridge.gate.run('send_qzone_msg', key, 'post_qzone', () => call('send_qzone_msg', {
        content, images, ugc_right: 1, target_uins: [],
      }))
      if (!r.ok) throw new Error('发说说被限流：' + r.reason)
      const tid = r.value && (r.value.tid || r.value.data && r.value.data.tid) || ''
      const detail = '说说已发出' + (tid ? '（tid ' + tid + '）' : '') + '：' + content.slice(0, 40)
      // [qzone-owner] 记下 tid，方便之后删
      try {
        const f = join(bridge.memoryDir, '..', 'qq-qzone-posts.json')
        let all = []
        try { all = JSON.parse(readFileSync(f, 'utf8')) } catch { all = [] }
        if (tid) { all.push({ tid, content: content.slice(0, 200), at: Date.now() }); if (all.length > 100) all = all.slice(-100); writeFileSync(f, JSON.stringify(all, null, 2), 'utf8') }
      } catch { /* ignore */ }
      return { ok: true, detail }
    },
  }))
}
