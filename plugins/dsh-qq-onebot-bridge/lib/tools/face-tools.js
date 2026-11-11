// 表情工具：列出可用表情、发送表情/收藏图。
export function registerFaceTools({ agentCtx, route, defineTool, bridge, chatKeyOf, linkSticker }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_face_list',
    description: 'List emoticons available for the current QQ chat: common yellow-face emoticons (by Chinese name) and saved image stickers collected from this chat.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { count: { type: 'number', required: true }, sample: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.sample }],
    },
    async execute() {
      const { yellow, saved } = bridge.faces.list()
      const names = yellow.slice(0, 30).map((f) => f.name).join('、')
      const stickers = saved.map((s) => s.name + (s.desc ? '（' + s.desc + '）' : (s.pendingDesc ? '（未描述，未收藏）' : ''))).join('、') || '无'
      return {
        count: yellow.length + saved.length,
        sample: `黄脸表情（用 qq_face_send 发送或回复里写 [face:名字]）：${names}\n收藏图片表情：${stickers}`,
      }
    },
  }))
  agentCtx.tools.register(defineTool({
    name: 'qq_face_send',
    description: 'Send an emoticon to the current QQ chat. Accepts a Chinese yellow-face name (微笑 撇嘴 呲牙 偷笑 大哭 鼓掌 爱心 拥抱 强 ...) or a saved sticker name (see qq_face_list).',
    parameters: {
      name: { type: 'string', description: 'Face name, e.g. 鼓掌, or a saved sticker name.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { sent: { type: 'boolean', required: true }, label: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.sent ? `已发送表情：${value.label}` : `表情发送失败：${value.label}` }],
    },
    async execute(args) {
      const resolved = bridge.faces.resolve(String(args.name ?? ''))
      if (!resolved) throw new Error(`unknown face: ${args.name}. Call qq_face_list to see available names.`)
      await bridge.server.sendSegments(route.bot, route.messageType, route.targetId, resolved.segments)
      const nm = (String(resolved.label || '').match(/收藏图\[([^\]]+)\]/) || [])[1]
      linkSticker(chatKeyOf(route), nm || String(args.name ?? ''))
      return { sent: true, label: resolved.label }
    },
  }))
}
