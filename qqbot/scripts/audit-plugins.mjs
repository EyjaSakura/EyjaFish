// 功能插件全量审计：分层契约、hooks、插件清单、重复工具名。
// 用法：node scripts/audit-plugins.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'D:\\DSH\\plugins\\features'
const BRIDGE = 'D:\\DSH\\plugins\\dsh-qq-onebot-bridge\\lib\\bridge.js'
const BRIDGE_LIB = 'D:\\DSH\\plugins\\dsh-qq-onebot-bridge\\lib'

const bridge = readFileSync(BRIDGE, 'utf8')
function walkLib(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walkLib(full))
    else if (name.endsWith('.js')) out.push(full)
  }
  return out
}
// Hook call sites live in bridge.js and in lib/services/* after extraction.
const libText = walkLib(BRIDGE_LIB).map((file) => readFileSync(file, 'utf8')).join('\n')
const called = new Set()
for (const m of libText.matchAll(/__FEATURES\.get\('([^']+)'\)/g)) called.add(m[1])
for (const m of libText.matchAll(/for \(const hookName of \[([^\]]+)\]\)/g)) {
  for (const h of m[1].matchAll(/'([^']+)'/g)) called.add(h[1])
}

const issues = []
const tools = new Map()
const hookOwners = new Map()
let hookCount = 0
let featureCount = 0

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.js')) out.push(full)
  }
  return out
}

for (const name of readdirSync(ROOT).sort()) {
  const dir = join(ROOT, name)
  const indexPath = join(dir, 'index.js')
  if (!existsSync(indexPath)) continue
  featureCount += 1
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) issues.push(`${name}: 缺 package.json`)
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {}
  if (!pkg.name) issues.push(`${name}: package.json 缺 name`)
  if (pkg.type !== 'module') issues.push(`${name}: package.json 需要 "type": "module"`)

  const declared = (pkg.dshFeature?.hooks ?? []).map(String)
  const src = readFileSync(indexPath, 'utf8')
  const m = src.match(/export const hooks\s*=\s*\{([^}]*)\}/)
  const exported = m
    ? m[1].split(',').map((x) => x.trim().split(':')[0].trim()).filter(Boolean)
    : []
  hookCount += exported.length

  if (declared.length && new Set(declared).size !== new Set(exported).size) {
    issues.push(`${name}: package.json hooks 与 index.js 导出数量不一致`)
  }
  for (const h of declared) if (!exported.includes(h)) issues.push(`${name}: package 声明了 ${h} 但未导出`)
  for (const h of exported) if (!declared.includes(h) && declared.length) issues.push(`${name}: 导出了 ${h} 但 package 未声明`)
  for (const h of exported) if (!called.has(h) && !libText.includes("'" + h + "'") && !(h === 'registerFeature' && libText.includes('registerFeature'))) issues.push(`${name}: hook ${h} 没有被 bridge 调用`)
  for (const h of exported) {
    if (hookOwners.has(h)) issues.push(`重复 hook ${h}: ${hookOwners.get(h)} 与 ${name}`)
    else hookOwners.set(h, name)
  }

  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const mm of text.matchAll(/defineTool\(\{[\s\S]{0,400}?name:\s*'([a-zA-Z0-9_]+)'/g)) {
      const t = mm[1]
      if (!tools.has(t)) tools.set(t, [])
      tools.get(t).push(name)
    }
  }

  // 分层契约：功能插件只能从 lib/sdk/ 导入桥接包内容
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const mm of text.matchAll(/@zfqxuz\/dsh-qq-onebot-bridge\/lib\/([^'"]+)/g)) {
      if (!mm[1].startsWith('sdk/')) {
        issues.push(`${name}: ${file.slice(ROOT.length + 1)} 越层 import lib/${mm[1]}`)
      }
    }
  }
}

for (const [tool, owners] of tools) {
  if (owners.length > 1) issues.push(`重复工具 ${tool}: ${owners.join(', ')}`)
}

// SDK 引用的模块必须真实存在
for (const mm of readFileSync(join(BRIDGE_LIB, 'sdk', 'index.js'), 'utf8').matchAll(/from '\.\.\/([^']+)'/g)) {
  if (!existsSync(join(BRIDGE_LIB, mm[1]))) issues.push(`SDK 指向不存在的模块 lib/${mm[1]}`)
}

console.log(`features=${featureCount} hooks=${hookCount} tools=${tools.size}`)
console.log(`issues=${issues.length}`)
for (const issue of issues) console.log(' -', issue)
process.exitCode = issues.length ? 1 : 0
