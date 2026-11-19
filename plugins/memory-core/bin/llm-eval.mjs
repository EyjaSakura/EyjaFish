// Offline LLM extraction eval. Never touches live memory/recall.
// Usage:
//   $env:DEEPSEEK_API_KEY=...; $env:DASHSCOPE_API_KEY=...
//   node bin/llm-eval.mjs --limit 5 --model both
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openStore, closeStore, DEFAULT_DB, buildExtractionPrompt, parseExtraction, validateExtraction, extractStageOneNodes } from '../index.mjs'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const limit = Math.max(1, Math.min(100, Number(arg('--limit', 5)) || 5))
const modelChoice = String(arg('--model', 'both'))
const db = openStore(DEFAULT_DB)
const rows = db.prepare(`SELECT td.window_id,td.turn_index,wt.subject,wt.text,wt.ts
  FROM turn_decisions td JOIN window_turns wt
    ON wt.window_id=td.window_id AND wt.turn_index=td.turn_index AND wt.role='user'
  WHERE td.decision='extract'
  ORDER BY wt.ts DESC LIMIT ?`).all(limit)
closeStore(db)

function caseId(row) { return `${row.window_id}:${row.turn_index}` }

async function callOpenAI({ url, key, model, prompt, extra = {} }) {
  const started = Date.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 1200,
      ...extra,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const latencyMs = Date.now() - started
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text)
  return { latencyMs, content: String(json?.choices?.[0]?.message?.content ?? ''), usage: json.usage ?? null }
}

function summarize(model, results) {
  const parsed = results.filter((r) => r.parseOk)
  const allNodes = parsed.flatMap((r) => r.nodes)
  const byType = {}
  for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1
  return {
    model,
    cases: results.length,
    parseOk: parsed.length,
    parseFail: results.length - parsed.length,
    nodes: allNodes.length,
    byType,
    avgLatencyMs: results.length ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length) : 0,
    avgNodes: parsed.length ? Number((allNodes.length / parsed.length).toFixed(2)) : 0,
  }
}

const results = { deepseek: [], qwen: [] }
for (const row of rows) {
  const turns = [{ index: row.turn_index, role: 'user', text: String(row.text ?? ''), ts: row.ts }]
  const prompt = buildExtractionPrompt({ subject: row.subject, turns })
  const base = { caseId: caseId(row), subject: row.subject, text: String(row.text ?? '').slice(0, 300) }
  if (modelChoice === 'both' || modelChoice === 'deepseek') {
    try {
      const out = await callOpenAI({
        url: 'https://api.deepseek.com/chat/completions',
        key: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-flash',
        prompt,
        extra: { reasoning_effort: 'none' },
      })
      const nodes = validateExtraction(parseExtraction(out.content), { subject: row.subject, windowId: row.window_id, traceId: `eval-${caseId(row)}`, turns })
      results.deepseek.push({ ...base, ...out, parseOk: true, nodes })
    } catch (error) {
      results.deepseek.push({ ...base, latencyMs: 0, content: '', parseOk: false, error: String(error?.message ?? error) })
    }
  }
  if (modelChoice === 'both' || modelChoice === 'qwen') {
    try {
      const out = await callOpenAI({
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        key: process.env.DASHSCOPE_API_KEY,
        model: 'qwen3-vl-plus',
        prompt,
      })
      const nodes = validateExtraction(parseExtraction(out.content), { subject: row.subject, windowId: row.window_id, traceId: `eval-${caseId(row)}`, turns })
      results.qwen.push({ ...base, ...out, parseOk: true, nodes })
    } catch (error) {
      results.qwen.push({ ...base, latencyMs: 0, content: '', parseOk: false, error: String(error?.message ?? error) })
    }
  }
  process.stderr.write(`[eval] ${caseId(row)}\n`)
}

const report = {
  generatedAt: new Date().toISOString(),
  limit,
  cases: rows.length,
  summary: {
    deepseek: summarize('deepseek-flash', results.deepseek),
    qwen: summarize('qwen3-vl-plus', results.qwen),
    ruleBaseline: rows.map((row) => extractStageOneNodes({ subject: row.subject, windowId: row.window_id, traceId: `eval-${caseId(row)}`, turns: [{ index: row.turn_index, role: 'user', text: row.text, ts: row.ts }] }).length).reduce((a, b) => a + b, 0),
  },
  results,
}
const outFile = resolve('D:\\DSH\\qqbot\\data\\memory', `llm-eval-${new Date().toISOString().slice(0, 10)}-${modelChoice}-${limit}.json`)
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify({ outFile, summary: report.summary, cases: report.cases }, null, 2))
