// Window narrative: turn a closed window into one durable narrative node.
// The LLM step is optional; the deterministic fallback keeps daily jobs usable
// when the API is unavailable or the key is absent.
import { addNode } from './store.mjs'
import { callDeepSeek } from './llm-client.mjs'

export const NARRATIVE_PROMPT_HEAD = `把下面这段窗口对话压缩成一段中文叙事摘要，供以后回忆时使用。
要求：
- 120~220 字，只写发生过的事和明确结论。
- 保留：谁、发生了什么、决定/承诺、未完成事项。
- 不写分析过程，不写“用户说/助手说”，不编造未出现的信息。
- 直接输出摘要正文，不要 Markdown，不要引号。

窗口：
`

function cleanText(value, max = 400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function buildNarrativePrompt(turns, { subject = '', windowId = '', maxChars = 6000 } = {}) {
  const lines = []
  let used = 0
  for (const turn of turns) {
    const who = turn.role === 'user' ? '对方' : turn.role === 'assistant' ? '我' : '记录'
    const line = `${who}：${cleanText(turn.text, 400)}`
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length
  }
  return `${NARRATIVE_PROMPT_HEAD}${lines.join('\n')}`
}

export function deterministicNarrative(turns, { subject = '' } = {}) {
  const userTurns = turns.filter((t) => t.role === 'user')
  const assistantTurns = turns.filter((t) => t.role === 'assistant')
  const picks = [...userTurns.slice(-6), ...assistantTurns.slice(-2)]
    .map((t) => cleanText(t.text, 160))
    .filter((t) => t.length >= 4)
  if (picks.length === 0) return ''
  const body = picks.join('；')
  return cleanText(`本窗口共 ${turns.length} 条对话。${body}`, 600)
}

/**
 * @param {any} db
 * @param {string} windowId
 * @param {{ apiKey?: string, fetchImpl?: any, now?: number, maxTurns?: number, allowLLM?: boolean }} [options]
 */
export async function generateWindowNarrative(db, windowId, {
  apiKey = '',
  fetchImpl = fetch,
  now = Date.now(),
  maxTurns = 40,
  allowLLM = true,
} = {}) {
  const win = db.prepare('SELECT window_id,subject,closed_at,narrative_status FROM windows WHERE window_id=?').get(String(windowId))
  if (!win) return { ok: false, reason: 'window-not-found' }
  const existing = db.prepare("SELECT id FROM nodes WHERE dedup_key=?").get(`narrative:${windowId}`)
  if (existing) {
    db.prepare("UPDATE windows SET narrative_status='done' WHERE window_id=?").run(String(windowId))
    return { ok: true, skipped: true, nodeId: existing.id }
  }
  const turns = db.prepare(`SELECT turn_index,role,text,ts FROM window_turns
    WHERE window_id=? ORDER BY turn_index, CASE role WHEN 'user' THEN 0 ELSE 1 END LIMIT ?`)
    .all(String(windowId), Number(maxTurns))
  if (turns.length === 0) {
    db.prepare("UPDATE windows SET narrative_status='empty' WHERE window_id=?").run(String(windowId))
    return { ok: true, skipped: true, reason: 'empty-window' }
  }

  let text = ''
  let source = 'window_narrative_fallback'
  if (allowLLM && apiKey) {
    try {
      const raw = await callDeepSeek({
        prompt: buildNarrativePrompt(turns, { subject: String(win.subject ?? ''), windowId: String(windowId) }),
        apiKey,
        fetchImpl,
      })
      const cleaned = String(raw ?? '').replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim()
      if (cleaned.length >= 20) { text = cleanText(cleaned, 1000); source = 'window_narrative_llm' }
    } catch { /* fallback below */ }
  }
  if (!text) text = deterministicNarrative(turns, { subject: String(win.subject ?? '') })
  if (!text) {
    db.prepare("UPDATE windows SET narrative_status='empty' WHERE window_id=?").run(String(windowId))
    return { ok: true, skipped: true, reason: 'no-narrative' }
  }

  const nodeId = `narrative-${String(windowId)}`
  const result = addNode(db, {
    id: nodeId,
    type: 'narrative',
    subject: String(win.subject ?? 'unknown'),
    description: text,
    source,
    importance: 0.6,
    confidence: 0.8,
    window_id: String(windowId),
    dedup_key: `narrative:${windowId}`,
    created_at: now,
    last_accessed_at: null,
    access_count: 0,
    time_scope: 'window',
  })
  db.prepare("UPDATE windows SET narrative_status='done', closed_at=COALESCE(closed_at, ?) WHERE window_id=?")
    .run(now, String(windowId))
  return { ok: true, skipped: !result.inserted, nodeId: result.id, source, chars: text.length }
}
