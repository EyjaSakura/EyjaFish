import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
// 媒体工具：发图片 / 发文件 / TTS 语音 / 本地音频当语音条 / 撤回
// 私有能力全部由 bridge 注入，不再直接访问 #private 方法。
export function registerMediaTools({ defineTool, agentCtx, route, key, role, bridge, debugLog = /** @type {(...args:any[])=>void} */ (() => {}) }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_send_image',
    description: `Send a local image file into the current QQ chat. The path must be inside an allowed directory (${bridge.sendRoots(role).join(', ')}). Large images are compressed automatically.`,
    parameters: {
      path: { type: 'string', description: 'Local image path (absolute, or relative to the working directory).' },
      caption: { type: 'string', description: 'Optional text sent before the image.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { sent: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const blocked = bridge.writeGate(route, 'qq.write.image')
      if (blocked !== '') return { sent: false, detail: blocked }
      if (bridge.injectionSuppressed(key)) { bridge.markSuppressed(key, '图片'); return { sent: false, detail: '注入回合：出站已被 dry-run 拦下（未发送）' } }
      const file = bridge.resolveSendPath(String(args.path ?? ''), role)
      const detail = await bridge.sendImageTo(route, file, String(args.caption ?? ''))
      return { sent: true, detail }
    },
  }))
  agentCtx.tools.register(defineTool({
    name: 'qq_send_file',
    description: `Send a local file into the current QQ chat (group files upload to the group file list; private chats receive it as a file message). The path must be inside an allowed directory (${bridge.sendRoots(role).join(', ')}).`,
    parameters: {
      path: { type: 'string', description: 'Local file path (absolute, or relative to the working directory).' },
      name: { type: 'string', description: 'Optional file name shown to the receiver (defaults to the real name).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { sent: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const blocked = bridge.writeGate(route, 'qq.write.file')
      if (blocked !== '') return { sent: false, detail: blocked }
      if (bridge.injectionSuppressed(key)) { bridge.markSuppressed(key, '文件'); return { sent: false, detail: '注入回合：出站已被 dry-run 拦下（未发送）' } }
      const file = bridge.resolveSendPath(String(args.path ?? ''), role)
      const detail = await bridge.sendFileTo(route, file, String(args.name ?? ''))
      return { sent: true, detail }
    },
  }))
  if (bridge.ttsUsable() && !agentCtx.__gv2Voice) {
    agentCtx.tools.register(defineTool({
      name: 'qq_send_voice',
      description: 'Synthesize the given text with the configured TTS provider and send it to the current QQ chat as a voice message (use sparingly: voice messages are slower and more noticeable).',
      parameters: {
        text: { type: 'string', description: 'Text to speak (kept under ttsMaxChars).' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { sent: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.detail }],
      },
      async execute(args) {
        const blocked = bridge.writeGate(route, 'qq.write.voice')
        if (blocked !== '') return { sent: false, detail: blocked }
        if (bridge.injectionSuppressed(key)) { bridge.markSuppressed(key, '语音', String(args.text ?? '')); return { sent: false, detail: '注入回合：出站已被 dry-run 拦下（未发送）' } }
        const text = String(args.text ?? '').trim()
        if (!text) throw new Error('没有要朗读的文字')
        const detail = await bridge.sendVoiceTo(route, text)
        return { sent: true, detail }
      },
    }))
  }
  // [voice-file 2026-10-31] 把本地音频当"语音消息"发出去（克隆出来的声音要发成语音，不是文件）
  agentCtx.tools.register(defineTool({
    name: 'qq_send_voice_file',
    description: '把一个本地音频文件作为语音消息发到当前聊天（不是文件消息）。路径需在允许目录内。',
    parameters: { path: { type: 'string', description: '本地音频路径（mp3/wav）' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { sent: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const blocked = bridge.writeGate(route, 'qq.write.voice')
      if (blocked !== '') return { sent: false, detail: blocked }
      if (bridge.injectionSuppressed(key)) { bridge.markSuppressed(key, '语音'); return { sent: false, detail: '注入回合：出站已被 dry-run 拦下（未发送）' } }
      const file = bridge.resolveSendPath(String(args.path ?? ''), role)
      if (!existsSync(file)) throw new Error('音频文件不存在：' + file)
      const voiceSrc = 'base64://' + readFileSync(file).toString('base64')
      await bridge.sendRecord(route, voiceSrc)
      const size = Math.round(statSync(file).size / 1024)
      debugLog(`voice file sent (${file}, ${size}KB)`)
      return { sent: true, detail: `已发送语音：${basename(file)}（${size} KB）` }
    },
  }))
  agentCtx.tools.register(defineTool({
    name: 'qq_recall',
    description: 'Withdraw (recall) the most recent messages YOU sent in this chat, newest first. Only messages sent by this bridge can be recalled.',
    parameters: {
      count: { type: 'number', description: 'How many of your recent messages to withdraw (default 1, max 5).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { recalled: { type: 'number', required: true }, detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const blocked = bridge.writeGate(route, 'qq.write.recall')
      if (blocked !== '') return { recalled: 0, detail: blocked }
      if (bridge.injectionSuppressed(key)) { bridge.markSuppressed(key, '撤回操作'); return { recalled: 0, detail: '注入回合：撤回已被 dry-run 拦下（未执行）' } }
      const count = Math.min(5, Math.max(1, Number(args.count) || 1))
      const recalled = await bridge.recallRecent(bridge.chatKeyOf(route), count)
      return { recalled, detail: recalled > 0 ? `已撤回 ${recalled} 条消息` : '没有可撤回的消息（可能已超时或未记录）' }
    },
  }))

}

export const hooks = { registerMediaTools }
