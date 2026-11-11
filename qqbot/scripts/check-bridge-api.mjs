// 公开 API 冻结 + 下游调用图检查。
// 用法：
//   node scripts/check-bridge-api.mjs            # CI 检查
//   node scripts/check-bridge-api.mjs --update   # 有意修改公开 API 后更新基线
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'D:\\DSH\\plugins\\dsh-qq-onebot-bridge'
const FEATURES = 'D:\\DSH\\plugins\\features'
const BRIDGE = join(ROOT, 'lib', 'bridge.js')
const FACADE = join(ROOT, 'lib', 'services', 'bridge-facade.js')
const BASELINE = join(ROOT, 'bridge-public-api.json')
const REPORT = 'D:\\DSH\\qqbot\\logs\\bridge-api-report.json'
const UPDATE = process.argv.includes('--update')

const source = readFileSync(BRIDGE, 'utf8')
const facadeSource = readFileSync(FACADE, 'utf8')
const methods = new Set(
  [...`${source}\n${facadeSource}`.matchAll(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]),
)
const fields = new Set()
for (const line of source.split(/\r?\n/)) {
  if (!/^\s{2}[A-Za-z_$]/.test(line)) continue
  for (const m of line.matchAll(/([A-Za-z_$][\w$]*)\s*;/g)) fields.add(m[1])
}

// 运行时动态状态字段（不在类字段声明里，但 feature 允许读写）。
const STATE_FIELDS = new Set([
  'js', 'outbox', 'rateNoticeMap', 'stickerMsgMap', 'qzoneCookieCache', 'qzoneClientService',
  'archiveWarnedAt', 'douyinSentAt', 'injectConsumed', 'injectInterval', 'injectLastAt',
  'injectReplyTarget', 'lastQuotedAt', 'lastQuotedImages', 'lastQuotedStickerName',
  'lastQzonePollAt', 'lastSticker', 'lastStickerName', 'unknownSessionSeen',
  'workspaceBackfillPending', 'workspaceRegistryNoted', 'workspaceRegistryVia',
  'debugLog', 'serve',
])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}

const current = { methods: [...methods].sort(), fields: [...fields].sort() }

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify({ version: 1, ...current }, null, 2)}\n`, 'utf8')
  console.log(`updated ${BASELINE}: methods=${current.methods.length} fields=${current.fields.length}`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))

const errors = []
for (const name of baseline.methods ?? []) {
  if (!methods.has(name)) errors.push(`公开方法被删除：bridge.${name}`)
}
for (const name of methods) {
  if (!(baseline.methods ?? []).includes(name)) errors.push(`新增公开方法未入基线：bridge.${name}（确认后 --update）`)
}
for (const name of baseline.fields ?? []) {
  if (!fields.has(name)) errors.push(`公开状态字段被删除：bridge.${name}`)
}

const callFiles = [...walk(FEATURES), join(ROOT, 'lib', 'message-pipeline.js'), join(ROOT, 'lib', 'reply-router.js')]
const refs = new Map()
for (const file of callFiles) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/\bbridge\??\.([A-Za-z_$][\w$]*)/g)) {
    const name = m[1]
    if (methods.has(name) || fields.has(name) || STATE_FIELDS.has(name)) continue
    if (!refs.has(name)) refs.set(name, [])
    refs.get(name).push(relative(FEATURES, file))
  }
}
for (const [name, files] of refs) errors.push(`下游调用了不存在的 bridge.${name}（${files[0]}）`)

const report = {
  at: new Date().toISOString(),
  methods: methods.size,
  fields: fields.size,
  callFiles: callFiles.length,
  errors,
}
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`bridge API methods=${methods.size} fields=${fields.size} calls=${callFiles.length}`)
console.log(`errors=${errors.length}`)
for (const e of errors) console.log(' -', e)
process.exitCode = errors.length ? 1 : 0
