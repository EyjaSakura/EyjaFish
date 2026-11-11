// dsh-tool-fs-jailed — root-confined read/glob/grep tools for QQ sessions.
// The bridge loads this file directly via lib/services/jailed-fs.js.
// It deliberately has no package imports: it must load even when the profile's
// node_modules does not contain @deepseek-ai/dsh-tools.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const READ_MAX_BYTES = 50 * 1024
const READ_MAX_LINES = 400
const GLOB_MAX = 200
const GREP_MAX = 200

function normalizeRoots(root, extraRoots) {
  const list = []
  for (const value of [root, ...(extraRoots ?? [])]) {
    const raw = typeof value === 'string' ? value : value?.root
    if (!raw) continue
    const abs = resolve(raw)
    list.push(existsSync(abs) ? realpathSync(abs) : abs)
  }
  return [...new Set(list)]
}

function isInside(candidate, root) {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

function makeGuard(roots) {
  return function guarded(input) {
    const requested = String(input ?? '').trim()
    if (requested === '') throw new Error('path is required')
    const abs = isAbsolute(requested) ? resolve(requested) : resolve(roots[0], requested)
    const real = existsSync(abs) ? realpathSync(abs) : abs
    if (!roots.some((root) => isInside(real, root))) {
      throw new Error(`path outside jail: ${requested}`)
    }
    return real
  }
}

function textTool(name, description, parameters, execute) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
      render: (_args, value) => [{ type: 'text', text: String(value.text ?? '') }],
    },
    async execute(args) {
      return { text: await execute(args) }
    },
  }
}

function globToRegExp(pattern) {
  let out = '^'
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*'
        i += 1
      } else out += '[^/]*'
    } else if (char === '?') out += '[^/]'
    else out += char.replace(/[\\^$+.()|[\]{}]/g, '\\$&')
  }
  return new RegExp(out + '$')
}

function walkFiles(root, limit, out) {
  const stack = [root]
  while (stack.length > 0 && out.length < limit) {
    const dir = stack.pop()
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const full = resolve(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        stack.push(full)
      } else if (entry.isFile()) {
        out.push(full)
        if (out.length >= limit) break
      }
    }
  }
  return out
}

export function apply(ctx, options = {}) {
  const roots = normalizeRoots(options.root, options.extraRoots)
  if (roots.length === 0) throw new Error('dsh-tool-fs-jailed: root is required')
  const guard = makeGuard(roots)

  ctx.tools.register(textTool(
    'read',
    'Read a UTF-8 text file inside the session jail. Paths are relative to the jail root; absolute paths outside the jail are rejected.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['file_path'],
      properties: {
        file_path: { type: 'string', description: 'Path inside the session jail.' },
        offset: { type: 'number', description: '1-based first line (default 1).' },
        limit: { type: 'number', description: `Maximum lines (default and max ${READ_MAX_LINES}).` },
      },
    },
    async (args) => {
      const file = guard(args.file_path)
      const info = statSync(file)
      if (!info.isFile()) throw new Error(`not a file: ${args.file_path}`)
      const raw = readFileSync(file, 'utf8')
      const lines = raw.split(/\r?\n/)
      const offset = Math.max(1, Math.trunc(Number(args.offset) || 1))
      const limit = Math.max(1, Math.min(READ_MAX_LINES, Math.trunc(Number(args.limit) || READ_MAX_LINES)))
      const selected = []
      let bytes = 0
      for (let i = offset - 1; i < lines.length && selected.length < limit; i += 1) {
        const line = `${i + 1}: ${lines[i]}`
        bytes += Buffer.byteLength(line, 'utf8') + 1
        if (bytes > READ_MAX_BYTES) break
        selected.push(line)
      }
      return selected.join('\n') + `\n\n(${lines.length} lines total)`
    },
  ))

  ctx.tools.register(textTool(
    'glob',
    `List files inside the session jail matching a glob pattern (max ${GLOB_MAX}).`,
    {
      type: 'object',
      additionalProperties: false,
      required: ['pattern'],
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. **/*.md.' },
        path: { type: 'string', description: 'Directory inside the jail (default root).' },
      },
    },
    async (args) => {
      const start = args.path ? guard(args.path) : roots[0]
      if (!statSync(start).isDirectory()) throw new Error(`not a directory: ${args.path}`)
      const files = walkFiles(start, 2000, [])
      const matcher = globToRegExp(String(args.pattern))
      const hits = []
      for (const full of files) {
        const rel = relative(roots[0], full).split(sep).join('/')
        if (matcher.test(rel)) hits.push(rel)
        if (hits.length >= GLOB_MAX) break
      }
      return hits.length > 0 ? hits.join('\n') : '(no matches)'
    },
  ))

  ctx.tools.register(textTool(
    'grep',
    `Search text files inside the session jail for a regular expression (max ${GREP_MAX} matches).`,
    {
      type: 'object',
      additionalProperties: false,
      required: ['pattern'],
      properties: {
        pattern: { type: 'string', description: 'Regular expression.' },
        path: { type: 'string', description: 'Directory or file inside the jail (default root).' },
      },
    },
    async (args) => {
      const start = args.path ? guard(args.path) : roots[0]
      const re = new RegExp(String(args.pattern), 'i')
      const files = statSync(start).isDirectory() ? walkFiles(start, 2000, []) : [start]
      const hits = []
      for (const full of files) {
        if (hits.length >= GREP_MAX) break
        let info
        try { info = statSync(full) } catch { continue }
        if (!info.isFile() || info.size > 1024 * 1024) continue
        let text
        try { text = readFileSync(full, 'utf8') } catch { continue }
        if (text.includes('\u0000')) continue
        const lines = text.split(/\r?\n/)
        for (let i = 0; i < lines.length && hits.length < GREP_MAX; i += 1) {
          if (re.test(lines[i])) hits.push(`${relative(roots[0], full).split(sep).join('/')}:${i + 1}: ${lines[i]}`)
        }
      }
      return hits.length > 0 ? hits.join('\n') : '(no matches)'
    },
  ))
}
