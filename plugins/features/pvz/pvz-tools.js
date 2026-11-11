// 自动拆分自 contacts/identity.js
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync, renameSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { join, basename, dirname, extname } from 'node:path'

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

export function registerPvzTools({ agentCtx, route, key, role, bridge, defineTool, debugLog }) {
  const out = {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.detail }],
  }

agentCtx.tools.register(defineTool({
    name: 'pvz_status',
    description: 'PvZ 双人合作：看大肥鱼那条鱼在不在、这局的阶段/阳光/植物数/僵尸数/击杀进度。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const r = await pvzCall('GET', '/status')
      if (!r.ok) return { detail: pvzDown(r.error) }
      const s = r.data
      return { detail: '房间 ' + s.room + ' ｜ 阶段 ' + s.phase + ' ｜ 阳光 ' + s.sun + ' ｜ 植物 ' + s.plants + ' ｜ 僵尸 ' + s.zombies + ' ｜ 击杀 ' + s.killed + '/' + s.total + ' ｜ 自动打 ' + (s.autoplay ? '开' : '关') + ' ｜ 发了 ' + s.actions + ' 个动作' }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'pvz_observe',
    description: 'PvZ 双人合作：拿当前局面明细（每棵植物的行/列/血量、每只僵尸的行/位置/血量、冷却、地上的阳光）。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const r = await pvzCall('GET', '/observe')
      if (!r.ok) return { detail: pvzDown(r.error) }
      const s = r.data
      const plants = (s.plants || []).map((p) => '  ' + p.card + ' @' + p.row + '-' + p.col + ' hp' + p.hp)
      const zombies = (s.zombies || []).map((z) => '  ' + z.type + ' 第' + z.row + '行 x=' + z.x + ' hp' + z.hp)
      const suns = (s.suns || []).map((x) => '  sun ' + x.id + ' 剩' + x.life + 's')
      const cd = Object.entries(s.cooldowns || {}).map(([k, v]) => k + ':' + Number(v).toFixed(1)).join(' ')
      return { detail: '阶段 ' + s.phase + ' ｜ 阳光 ' + s.sun + ' ｜ 击杀 ' + s.killed + '/' + s.total + '\n植物：\n' + (plants.join('\n') || '  空') + '\n僵尸：\n' + (zombies.join('\n') || '  无') + '\n阳光：\n' + (suns.join('\n') || '  无') + '\n冷却：' + (cd || '无') }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'pvz_plant',
    description: 'PvZ 双人合作：种一棵植物。card 是卡片 id（sunflower/peashooter/wallnut/potatomine/snowpea/repeater/cherrybomb/chomper/threepeater/spikeweed），row 1~5，col 1~9。',
    parameters: { card: { type: 'string', description: '卡片 id' }, row: { type: 'number', description: '1~5' }, col: { type: 'number', description: '1~9' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const r = await pvzCall('POST', '/action', { op: 'plant', card: String(args.card || ''), row: Number(args.row), col: Number(args.col) })
      return { detail: r.ok ? '种下了 ' + args.card + ' @' + args.row + '-' + args.col : ('没种成：' + r.error) }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'pvz_shovel',
    description: 'PvZ 双人合作：铲掉某一格的植物。',
    parameters: { row: { type: 'number', description: '1~5' }, col: { type: 'number', description: '1~9' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const r = await pvzCall('POST', '/action', { op: 'shovel', row: Number(args.row), col: Number(args.col) })
      return { detail: r.ok ? '铲掉了 ' + args.row + '-' + args.col : ('没铲成：' + r.error) }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'pvz_collect',
    description: 'PvZ 双人合作：收一个阳光（id 从 pvz_observe 里拿）。',
    parameters: { id: { type: 'string', description: '阳光 id，例如 s12' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const r = await pvzCall('POST', '/action', { op: 'collect', id: String(args.id || '') })
      return { detail: r.ok ? '收下了 ' + args.id : ('没收成：' + r.error) }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'pvz_fuse',
    description: 'PvZ 双人合作：把一张卡融合到已有植物上（向日葵+豌豆/坚果+土豆雷/寒冰+双发）。',
    parameters: { card: { type: 'string', description: '要融合上去的卡 id' }, row: { type: 'number', description: '1~5' }, col: { type: 'number', description: '1~9' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const r = await pvzCall('POST', '/action', { op: 'fuse', card: String(args.card || ''), row: Number(args.row), col: Number(args.col) })
      return { detail: r.ok ? '融合了 ' + args.card + ' @' + args.row + '-' + args.col : ('没融合成：' + r.error) }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'pvz_ready',
    description: 'PvZ 双人合作：帮大肥鱼点准备（它进来时其实已经自动点了，重开一局后可能需要）。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const r = await pvzCall('POST', '/ready')
      return { detail: r.ok ? '点好准备了' : ('没点上：' + r.error) }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'pvz_autoplay',
    description: 'PvZ 双人合作：开/关大肥鱼的自动打（主人说「接管」就关）。on 不填默认开。',
    parameters: { on: { type: 'boolean', description: 'true 开自动打，false 关' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const on = args.on !== false
      const r = await pvzCall('POST', '/autoplay', { on })
      return { detail: r.ok ? ('自动打已' + (on ? '打开' : '关闭')) : ('没切成功：' + r.error) }
    },
  }))
}
