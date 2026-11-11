// 用量报表工具：扫描 DSH 会话日志，按「角色 × 模型」统计 token 与费用
//
// 数据来源：C:\Users\Eyjafjalla\.dsh\sessions\**\session.v4.jsonl.zstd
//   - request/header  → 本次请求的 provider / model
//   - assistant/message → usage.inputTokens / outputTokens / cacheReadTokens
// 价格：D:\DSH\qqbot\data\model-prices.json（可随时改，不用重启）
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const SESSIONS_ROOT = 'C:\\Users\\Eyjafjalla\\.dsh\\sessions'
const PRICES_FILE = 'D:\\DSH\\qqbot\\data\\model-prices.json'
const COLUMNS = ['qwen3-vl-plus', 'deepseek-v4.1-flash']

function walk(dir, out = []) {
  let list = []
  try { list = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const ent of list) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (ent.name === 'session.v4.jsonl.zstd') out.push(p)
  }
  return out
}

/** 解 zstd 多帧（DSH 会话文件是一帧一帧追加的）。 */
function readEvents(file) {
  const buf = readFileSync(file)
  const magics = []
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) magics.push(i)
  }
  const parts = []
  for (let k = 0; k < magics.length; k++) {
    const start = magics[k]
    for (let j = k + 1; j <= Math.min(magics.length, k + 3); j++) {
      const end = j < magics.length ? magics[j] : buf.length
      try {
        parts.push(zstdDecompressSync(buf.subarray(start, end)).toString('utf8'))
        k = j - 1
        break
      } catch { /* 试下一帧边界 */ }
    }
  }
  const events = []
  for (const line of parts.join('').split('\n')) {
    if (!line) continue
    try { events.push(JSON.parse(line)) } catch { /* 半行 */ }
  }
  return events
}

function loadPrices() {
  const fallback = {
    'qwen3-vl-plus': {
      display: 'qwen3-vl-plus',
      provider: 'dashscope',
      input: { idle: 1, peak: 1 },
      cache: { idle: 0.2, peak: 0.2 },
      output: { idle: 10, peak: 10 },
    },
    'deepseek-flash': {
      display: 'deepseek-v4.1-flash',
      provider: 'deepseek-official',
      input: { idle: 1, peak: 2 },
      cache: { idle: 0.02, peak: 0.04 },
      output: { idle: 4, peak: 8 },
    },
  }
  try {
    const raw = JSON.parse(readFileSync(PRICES_FILE, 'utf8').replace(/^\uFEFF/, ''))
    return raw.models && typeof raw.models === 'object' ? raw.models : fallback
  } catch {
    return fallback
  }
}

/** 北京时间周一至周五 9:00-12:00 / 14:00-18:00 为高峰（法定节假日未处理）。 */
function isPeak(ms) {
  const bj = new Date(ms + 8 * 3600_000)
  const day = bj.getUTCDay()
  if (day === 0 || day === 6) return false
  const hour = bj.getUTCHours()
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

function rate(prices, model, field, ms) {
  const spec = prices[model]
  if (!spec || !spec[field]) return 0
  const r = spec[field]
  return isPeak(ms) ? (r.peak ?? r.idle ?? 0) : (r.idle ?? r.peak ?? 0)
}

function roleOf(file) {
  return /[\\/]qq-/.test(file) ? 'dafish' : 'dsh'
}

function parseRange(args) {
  const now = Date.now()
  const days = Number(args?.days)
  let start = now - (Number.isFinite(days) && days > 0 ? days : 7) * 86_400_000
  let end = now
  const s = String(args?.start || '').trim()
  const e = String(args?.end || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) start = Date.parse(s + 'T00:00:00+08:00')
  if (/^\d{4}-\d{2}-\d{2}$/.test(e)) end = Date.parse(e + 'T23:59:59.999+08:00')
  if (!Number.isFinite(start)) start = now - 7 * 86_400_000
  if (!Number.isFinite(end)) end = now
  return { start, end }
}

function fmtTok(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function fmtMoney(n) {
  return '¥' + (Math.round(n * 100) / 100).toFixed(2)
}

function aggregate(start, end, prices) {
  const files = walk(SESSIONS_ROOT)
  const buckets = new Map() // role|display -> { in, out, cache, cost }
  const bump = (role, display, usage, model, ms) => {
    const key = role + '|' + display
    const b = buckets.get(key) || { in: 0, out: 0, cache: 0, cost: 0 }
    b.in += usage.inputTokens || 0
    b.out += usage.outputTokens || 0
    b.cache += usage.cacheReadTokens || 0
    const inRate = rate(prices, model, 'input', ms)
    const cacheRate = rate(prices, model, 'cache', ms)
    const outRate = rate(prices, model, 'output', ms)
    b.cost += ((usage.inputTokens || 0) * inRate + (usage.cacheReadTokens || 0) * cacheRate + (usage.outputTokens || 0) * outRate) / 1_000_000
    buckets.set(key, b)
  }

  let scanned = 0
  for (const file of files) {
    let mtime = 0
    try { mtime = statSync(file).mtimeMs } catch { continue }
    if (mtime < start - 86_400_000) continue
    scanned++
    const role = roleOf(file)
    const events = readEvents(file)
    const stepModel = new Map()
    let lastModel = ''
    for (const ev of events) {
      const t = Number(ev.time) || 0
      if (t < start || t > end) continue
      const data = ev.data || {}
      if (ev.type === 'request/header') {
        const cfg = data.header?.config || {}
        const model = String(cfg.model || '')
        if (model) {
          lastModel = model
          if (data.turn != null && data.step != null) stepModel.set(data.turn + ':' + data.step, model)
        }
        continue
      }
      if (ev.type !== 'assistant/message') continue
      const usage = data.usage
      if (!usage) continue
      const key = data.turn != null && data.step != null ? data.turn + ':' + data.step : ''
      const model = key ? (stepModel.get(key) || lastModel) : lastModel
      if (!model) continue
      const spec = prices[model]
      if (!spec) continue
      bump(role, spec.display || model, usage, model, t)
    }
  }
  // 抖音 deep 分析走 qwen_deep.py 直连 DashScope，不在 DSH 会话里，单独补进来
  const qwenLog = 'D:\\DSH\\qqbot\\douyin\\qwen-usage.jsonl'
  try {
    const raw = readFileSync(qwenLog, 'utf8')
    for (const line of raw.split('\n')) {
      if (!line) continue
      let item = null
      try { item = JSON.parse(line) } catch { continue }
      const at = Number(item.at) || 0
      if (at < start || at > end) continue
      const u = item.usage || {}
      bump('dafish', 'qwen3-vl-plus', {
        inputTokens: Number(u.prompt_tokens || u.input_tokens || 0),
        outputTokens: Number(u.completion_tokens || u.output_tokens || 0),
        cacheReadTokens: 0,
      }, 'qwen3-vl-plus', at)
    }
  } catch { /* 没有日志就算了 */ }
  return { buckets, scanned }
}

function cell(bucket) {
  if (!bucket) return '输入 0 / 输出 0 · ¥0.00'
  return `输入 ${fmtTok(bucket.in)} / 输出 ${fmtTok(bucket.out)} · ${fmtMoney(bucket.cost)}`
}

const CHROME_CANDIDATES = [
  'D:\\DSH\\qqbot\\douyin\\cft\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

function fmtCell(b) {
  if (!b) return '输入0 / 输出0 · ¥0.00'
  return `输入${fmtTok(b.in)} / 输出${fmtTok(b.out)} · ${fmtMoney(b.cost)}`
}

function buildUsageHtml({ rangeText, columns, rows, grandTok, grandCost }) {
  const head = '<tr><th></th>' + columns.map((c) => `<th>${c}</th>`).join('') + '<th>合计</th></tr>'
  const body = rows.map((r) => {
    let tok = 0
    let cost = 0
    const cells = r.cells.map((b) => { tok += b.in + b.out; cost += b.cost; return `<td class="num">${fmtCell(b)}</td>` }).join('')
    return `<tr><td class="name">${r.label}</td>${cells}<td class="num total">${fmtTok(tok)} · ${fmtMoney(cost)}</td></tr>`
  }).join('')
  const colTotals = columns.map((_, i) => {
    let tok = 0
    let cost = 0
    for (const r of rows) { tok += r.cells[i].in + r.cells[i].out; cost += r.cells[i].cost }
    return `<td class="num total">${fmtTok(tok)} · ${fmtMoney(cost)}</td>`
  }).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;background:#08111f;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#dbeafe}
  .card{padding:26px 30px 22px}
  h1{font-size:20px;margin:0 0 4px;color:#8fd0ff;font-weight:600;letter-spacing:.5px}
  .sub{font-size:12px;color:#5d7fa8;margin-bottom:18px}
  table{border-collapse:collapse;width:100%}
  th,td{padding:11px 12px;border-bottom:1px solid #17395c;font-size:14px;text-align:left;white-space:nowrap}
  th{color:#8fd0ff;font-size:13px;font-weight:500}
  td.name{color:#eaf4ff;font-weight:600}
  td.num{color:#cfe3f5}
  td.total{color:#ffd479}
  tr:last-child td{border-bottom:0;padding-top:14px}
  </style></head><body><div class="card">
  <h1>模型用量</h1><div class="sub">${rangeText}</div>
  <table>${head}${body}<tr><td class="name">合计</td>${colTotals}<td class="num total">${fmtTok(grandTok)} · ${fmtMoney(grandCost)}</td></tr></table>
  </div></body></html>`
}

/** 用本地 Chrome 把 HTML 截成 PNG；失败返回空串。 */
function renderUsageImage(html, tag) {
  const dir = 'D:\\DSH\\qqbot\\data'
  mkdirSync(dir, { recursive: true })
  const htmlFile = `${dir}\\usage-${tag}.html`
  const pngFile = `${dir}\\usage-${tag}.png`
  writeFileSync(htmlFile, html, 'utf8')
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!chrome) return ''
  try {
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--window-size=820,400', '--virtual-time-budget=2500',
      `--screenshot=${pngFile}`,
      'file:///' + htmlFile.replace(/\\/g, '/'),
    ], { timeout: 30000, stdio: 'ignore' })
  } catch { /* 截图失败走文字兜底 */ }
  try { rmSync(htmlFile, { force: true }) } catch { }
  try {
    const st = statSync(pngFile)
    if (st.size > 1000) return pngFile
  } catch { }
  return ''
}

export function registerUsageTools({ defineTool, agentCtx, role, bridge, debugLog, route }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_usage_report',
    description: '按「角色 × 模型」统计 token 用量和费用。参数：start/end（YYYY-MM-DD）或 days（默认 7）。返回单行固定格式，收到后必须原样作为一条消息发送：不要改写、不要拆行、不要加解释。',
    parameters: {
      days: { type: 'number', description: '统计最近几天，默认 7；与 start/end 二选一' },
      start: { type: 'string', description: '开始日期 YYYY-MM-DD（含当天）' },
      end: { type: 'string', description: '结束日期 YYYY-MM-DD（含当天）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    async execute(args) {
      try {
        const prices = loadPrices()
        const { start, end } = parseRange(args || {})
        const { buckets, scanned } = aggregate(start, end, prices)
        const roles = [['dafish', '大肥鱼'], ['dsh', 'dsh']]
        const parts = []
        let grandTok = 0
        let grandCost = 0
        for (const [roleKey, label] of roles) {
          const cells = []
          for (const col of COLUMNS) {
            const b = buckets.get(roleKey + '|' + col)
            cells.push(col + ' ' + (b ? `输入${fmtTok(b.in)}/输出${fmtTok(b.out)} ${fmtMoney(b.cost)}` : '输入0/输出0 ¥0.00'))
            if (b) { grandTok += b.in + b.out; grandCost += b.cost }
          }
          parts.push(label + '：' + cells.join('，'))
        }
        parts.push('合计：' + fmtTok(grandTok) + ' ' + fmtMoney(grandCost))
        const rangeText = new Date(start).toLocaleString('zh-CN', { hour12: false }) + '~' + new Date(end).toLocaleString('zh-CN', { hour12: false })
        const detail = '【模型用量】' + rangeText + ' ｜ ' + parts.join(' ｜ ')
        // 生成表格图并发送；失败就只回文字
        let imageSent = false
        try {
          const rows = roles.map(([roleKey, label]) => ({
            label,
            cells: COLUMNS.map((col) => {
              const b = buckets.get(roleKey + '|' + col)
              return b ? { in: b.in, out: b.out, cost: b.cost } : { in: 0, out: 0, cost: 0 }
            }),
          }))
          const html = buildUsageHtml({ rangeText, columns: COLUMNS, rows, grandTok, grandCost })
          const png = renderUsageImage(html, Date.now().toString(36))
          if (png) {
            const b64 = readFileSync(png).toString('base64')
            await bridge.server.sendSegments(route.bot, route.messageType, route.targetId, [
              { type: 'image', data: { file: 'base64://' + b64 } },
            ])
            imageSent = true
            try { rmSync(png, { force: true }) } catch { }
          }
        } catch (err) { try { debugLog?.('[usage] image failed: ' + err.message) } catch { } }
        return { detail }
      } catch (error) {
        return { detail: '用量统计失败：' + (error?.message || error) }
      }
    },
  }))
}
