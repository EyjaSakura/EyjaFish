// 轻量静态检查：不引第三方依赖，补 CI 里「语法之外」的那一层。
// 用法：node scripts/lint-project.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOTS = [
  'D:\\DSH\\plugins\\dsh-qq-onebot-bridge\\lib',
  'D:\\DSH\\plugins\\features',
]
const MAX_LINES = 900
const LARGE_FILE_EXCEPTIONS = new Set([join(ROOTS[0], 'bridge.js')])
// 这两处是 server 级兜底日志（没有注入 logger 的场合），只允许 console.error
const CONSOLE_ERROR_ALLOWED = new Set([join(ROOTS[0], 'faces.js'), join(ROOTS[0], 'onebot-server.js')])

const issues = []
const warnings = []

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules') continue
      out.push(...walk(full))
    } else if (name.endsWith('.js') || name.endsWith('.mjs')) {
      out.push(full)
    }
  }
  return out
}

const files = []
for (const root of ROOTS) files.push(...walk(root))

// 规则 1/2：日志与 debugger
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n').length
  const rel = file.replace(/^D:\\DSH\\plugins\\/, '')

  if (/\bdebugger\b/.test(text)) issues.push(`${rel}: 含 debugger`)
  if (/\bconsole\.(log|warn)\s*\(/.test(text)) issues.push(`${rel}: 使用 console.log/warn，请用 debugLog/logger`)
  if (/\bconsole\.error\s*\(/.test(text) && !CONSOLE_ERROR_ALLOWED.has(file)) issues.push(`${rel}: 使用 console.error，请用 debugLog/logger`)

  if (lines > MAX_LINES && !LARGE_FILE_EXCEPTIONS.has(file)) {
    warnings.push(`${rel}: ${lines} 行，超过 ${MAX_LINES}，考虑拆分`)
  }
}

// 规则 3：循环依赖
const fileSet = new Set(files)
const graph = new Map()
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const deps = []
  for (const m of text.matchAll(/(?:from\s+|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), m[1])
    if (fileSet.has(target)) deps.push(target)
  }
  graph.set(file, deps)
}
const GRAY = 1
const BLACK = 2
const color = new Map(files.map((f) => [f, 0]))
const stack = []
function dfs(node) {
  color.set(node, GRAY)
  stack.push(node)
  for (const next of graph.get(node) ?? []) {
    if (color.get(next) === GRAY) {
      const cycle = stack.slice(stack.indexOf(next)).concat(next)
        .map((f) => f.replace(/^D:\\DSH\\plugins\\/, ''))
      issues.push(`循环依赖：${cycle.join(' -> ')}`)
    } else if ((color.get(next) ?? 0) === 0) {
      dfs(next)
    }
  }
  stack.pop()
  color.set(node, BLACK)
}
for (const file of files) if ((color.get(file) ?? 0) === 0) dfs(file)

// 规则 4：功能插件之间不得互相 import
for (const file of files) {
  const m = /D:\\DSH\\plugins\\features\\([^\\]+)[\\/]/.exec(file)
  if (!m) continue
  const self = m[1]
  const text = readFileSync(file, 'utf8')
  for (const hit of text.matchAll(/from\s+['"]([^'"]*features[\\/]([^\\/]+)[^'"]*)['"]/g)) {
    if (hit[2] && hit[2] !== self) issues.push(`${file.replace(/^D:\\DSH\\plugins\\/, '')}: 跨插件 import ${hit[2]}`)
  }
}

for (const w of warnings) console.log('WARN', w)
for (const i of issues) console.log('FAIL', i)
console.log(`lint: warnings=${warnings.length} issues=${issues.length}`)
process.exitCode = issues.length ? 1 : 0
