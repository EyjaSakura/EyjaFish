// Legacy v2 migration: facts.json + events.jsonl -> nodes.
import { existsSync, readFileSync } from 'node:fs'
import { addNode } from './store.mjs'

export const DEFAULT_FACTS = 'D:\\DSH\\qqbot\\data\\memory\\facts.json'
export const DEFAULT_EVENTS = 'D:\\DSH\\qqbot\\data\\memory\\events.jsonl'

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

export function migrateLegacy(db, {
  factsFile = DEFAULT_FACTS,
  eventsFile = DEFAULT_EVENTS,
  dryRun = false,
} = {}) {
  const stats = { facts: 0, events: 0, inserted: 0, skipped: 0 }
  const facts = readJson(factsFile)?.facts
  if (Array.isArray(facts)) {
    for (const fact of facts) {
      stats.facts += 1
      const subject = String(fact.subject ?? 'legacy')
      const node = {
        id: `legacy-${fact.id ?? stats.facts}`,
        type: 'fact',
        subject,
        predicate: fact.predicate ?? null,
        description: String(fact.claim ?? fact.value ?? '').slice(0, 1000),
        raw_quote: String(fact.value ?? ''),
        importance: Number(fact.confidence) || 0.8,
        confidence: Number(fact.confidence) || 0.8,
        source: 'legacy',
        status: subject.startsWith('person.') ? 'pending' : 'active',
        dedup_key: `legacy-fact:${fact.id ?? stats.facts}`,
        created_at: Number(fact.recorded_at) || Number(fact.since) || Date.now(),
        owner_confirmed: subject.startsWith('person.') ? 0 : 1,
      }
      if (dryRun) { stats.skipped += 1; continue }
      const result = addNode(db, node)
      if (result.inserted) stats.inserted += 1
      else stats.skipped += 1
    }
  }
  if (existsSync(eventsFile)) {
    for (const line of readFileSync(eventsFile, 'utf8').split('\n')) {
      if (line.trim() === '') continue
      let event
      try { event = JSON.parse(line) } catch { continue }
      stats.events += 1
      const node = {
        id: `legacy-${event.id ?? stats.events}`,
        type: 'event',
        subject: String(event.who ?? event.project ?? 'legacy'),
        description: String(event.title ?? event.detail ?? '').slice(0, 1000),
        raw_quote: String(event.detail ?? ''),
        importance: 0.5,
        confidence: 0.8,
        source: 'legacy',
        status: 'active',
        dedup_key: `legacy-event:${event.id ?? stats.events}`,
        created_at: Number(event.at) || Date.now(),
        owner_confirmed: 1,
      }
      if (dryRun) { stats.skipped += 1; continue }
      const result = addNode(db, node)
      if (result.inserted) stats.inserted += 1
      else stats.skipped += 1
    }
  }
  return stats
}
