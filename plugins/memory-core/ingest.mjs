// Stage 1 ingest: deterministic events + durable window turns + queue record.
import { addNode, addWindowTurn, enqueue, setDecision } from './store.mjs'
import { extractStageOneNodes, isMemoryEvent, isInternalText } from './extract.mjs'

export function ingestTurn(db, payload = {}) {
  const subject = String(payload.subject ?? 'unknown')
  const windowId = String(payload.windowId ?? `w-${subject}`)
  const turns = Array.isArray(payload.turns) ? payload.turns : []
  const traceId = String(payload.traceId ?? '')
  const turnKey = `${traceId || windowId}:${turns[0]?.index ?? 0}`
  const queued = enqueue(db, { turnKey, payload })
  const write = db.transaction(() => {
    for (const turn of turns) {
      const internal = turn.role === 'user' && (turn.injected === true || isInternalText(turn.text))
      if (!internal) {
        addWindowTurn(db, {
          windowId,
          subject,
          index: turn.index ?? 0,
          role: turn.role ?? 'context',
          text: String(turn.text ?? '').slice(0, 2000),
          ts: turn.ts,
        })
      }
      if (turn.role === 'user') {
        setDecision(db, {
          windowId,
          index: turn.index ?? 0,
          decision: (turn.injected !== true && isMemoryEvent(turn.text)) ? 'extract' : 'skip',
          reason: (turn.injected !== true && isMemoryEvent(turn.text)) ? 'stage1-event' : 'internal-or-short',
        })
      }
    }
    const nodes = extractStageOneNodes({ subject, windowId, traceId, turns })
    const ids = []
    for (const node of nodes) {
      const result = addNode(db, node)
      if (result.inserted) ids.push(result.id)
    }
    db.prepare(`INSERT INTO windows(window_id,subject,opened_at,narrative_status)
      VALUES (?,?,?,'pending')
      ON CONFLICT(window_id) DO NOTHING`).run(windowId, subject, Date.now())
    db.prepare(`UPDATE ingest_queue SET status='done' WHERE turn_key=?`).run(turnKey)
    return { ids, nodes: nodes.length }
  })
  try {
    const result = write()
    return { accepted: true, windowId, queued: queued.queued, ...result }
  } catch (error) {
    db.prepare(`INSERT INTO ingest_dead_letter(turn_key,payload_json,error,created_at)
      VALUES (?,?,?,?)`).run(turnKey, JSON.stringify(payload), String(error?.message ?? error), Date.now())
    db.prepare(`UPDATE ingest_queue SET status='failed' WHERE turn_key=?`).run(turnKey)
    return { accepted: false, windowId, queued: queued.queued, error: String(error?.message ?? error) }
  }
}
