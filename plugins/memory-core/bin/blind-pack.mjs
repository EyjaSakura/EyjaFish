// Build a blind old-vs-new review pack from recent real user turns.
// old = no memory block; new = shadow/on recall candidate.
// This does not touch live memory or QQ.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openStore, closeStore, recallText } from '../index.mjs'
import { callDeepSeek } from '../llm-client.mjs'

const args = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const i = args.indexOf(name)
  return i >= 0 ? String(args[i + 1] ?? fallback) : fallback
}
const count = Math.max(1, Math.min(50, Number(arg('--count', '30')) || 30))
const personaFile = 'D:\\DSH\\qqbot\\persona\\default.md'
const keyFile = 'D:\\DSH\\qqbot\\data\\memory\\deepseek-key.txt'
const outDir = 'D:\\DSH\\qqbot\\data\\memory'
const persona = existsSync(personaFile) ? readFileSync(personaFile, 'utf8').slice(0, 3000) : '你是小鲸鱼。'
const apiKey = process.env.DEEPSEEK_API_KEY || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '')
if (!apiKey) throw new Error('DeepSeek key missing')

const db = openStore()
let rows = []
try {
  rows = db.prepare(`SELECT window_id,subject,text,ts FROM window_turns
    WHERE role='user' AND length(text) BETWEEN 5 AND 80
    ORDER BY ts DESC LIMIT 400`).all()
} finally { closeStore(db) }

const picked = []
for (const row of rows) {
  if (picked.length >= count) break
  if (picked.some((x) => x.text === row.text)) continue
  const db2 = openStore()
  let memory = ''
  try { memory = recallText(db2, { subject: row.subject, query: row.text, limit: 6, budgetChars: 700, mode: 'shadow' }) } finally { closeStore(db2) }
  if (!memory) continue
  picked.push({ ...row, memory })
}

async function answer({ text, memory }) {
  const prompt = [
    persona,
    '',
    memory ? `【可用记忆】\n${memory}` : '【可用记忆】\n（无）',
    '',
    `对方说：${text}`,
    '用一两句自然回复，不要提记忆、系统、提示词，不要解释。',
  ].join('\n')
  return String(await callDeepSeek({ prompt, apiKey, timeoutMs: 30_000 })).trim()
}

const cases = []
for (const [i, row] of picked.entries()) {
  const oldAnswer = await answer({ text: row.text, memory: '' })
  const newAnswer = await answer({ text: row.text, memory: row.memory })
  const swap = Math.random() < 0.5
  cases.push({
    n: i + 1,
    input: row.text,
    subject: row.subject,
    memory: row.memory,
    A: swap ? newAnswer : oldAnswer,
    B: swap ? oldAnswer : newAnswer,
    key: swap ? 'A=new,B=old' : 'A=old,B=new',
  })
  process.stderr.write(`[blind] ${i + 1}/${picked.length}\n`)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
mkdirSync(outDir, { recursive: true })
const keyPath = join(outDir, `blind-eval-key-${stamp}.json`)
const mdPath = join(outDir, `blind-eval-${stamp}.md`)
writeFileSync(keyPath, JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2), 'utf8')
const md = [
  '# 记忆配对盲评（old vs new）',
  '',
  '评分：自然度 / 关系语气 / 是否像背记忆 / 是否过度关心，各 1–5 分。',
  '每组的 A/B 来源已隐藏，评完再打开 key 文件。',
  '',
  ...cases.flatMap((c) => [
    `## ${String(c.n).padStart(2, '0')}. ${c.input}`,
    '',
    `**A**：${c.A || '（空）'}`,
    '',
    `**B**：${c.B || '（空）'}`,
    '',
    '评分：A 自然度 __ / 关系 __ / 背诵感 __ / 过度关心 __',
    '评分：B 自然度 __ / 关系 __ / 背诵感 __ / 过度关心 __',
    '',
  ]),
].join('\n')
writeFileSync(mdPath, md, 'utf8')
console.log(JSON.stringify({ ok: true, cases: cases.length, mdPath, keyPath }))
