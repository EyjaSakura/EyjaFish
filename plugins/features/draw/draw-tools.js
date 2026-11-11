// qq_draw：调用 bridge 的多 provider 生图，把图直接发到当前会话。
// 权限：主人 + 倩倩姐（由 bridge.drawAllowed 统一判断）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const lastAt = new Map()
const COOLDOWN_MS = 15000

export function registerFeature({ defineTool, agentCtx, route, key, bridge }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_draw',
    description: '画一张图并直接发到当前 QQ 会话（AI 生图）。返回用了哪个后端、是否有水印。',
    parameters: {
      prompt: { type: 'string', description: '画面描述，越具体越好（主体、风格、构图、颜色）' },
      size: { type: 'string', description: '可选尺寸，如 1024x1024；不填用默认' },
      caption: { type: 'string', description: '可选：发图前带一句话' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      if (!bridge.drawAllowed('u:' + String(route?.targetId ?? ''))) {
        return { ok: false, detail: '生图只对主人和倩倩姐开放' }
      }
      const prompt = String(args.prompt ?? '').trim()
      if (!prompt) throw new Error('需要画面描述')
      const cooling = Date.now() - (lastAt.get(key) || 0)
      if (cooling < COOLDOWN_MS) {
        return { ok: false, detail: `画得太快，等 ${Math.ceil((COOLDOWN_MS - cooling) / 1000)} 秒` }
      }
      lastAt.set(key, Date.now())

      const result = await bridge.generateImage(prompt, { size: String(args.size ?? '').trim() || undefined })
      const dir = 'D:\\DSH\\qqbot\\data\\drawings'
      mkdirSync(dir, { recursive: true })
      const ext = result.format === 'jpeg' ? 'jpg' : (result.format || 'png')
      const file = join(dir, `draw-${Date.now().toString(36)}.${ext}`)
      writeFileSync(file, result.buffer)

      const caption = String(args.caption ?? '').trim()
      if (typeof bridge.sendImageBuffer === 'function') await bridge.sendImageBuffer(route, result.buffer, caption)
      else await bridge.sendImageTo(route, file, caption)

      const bits = [result.provider + '/' + result.model]
      if (result.watermark) bits.push('带水印')
      if (result.cost) bits.push(`约 ¥${result.cost}`)
      return { ok: true, detail: `画好了（${bits.join('，')}）` }
    },
  }))
}
