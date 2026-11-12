// Adapter-owned status file. Deliberately independent of SQLite/memory-core.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const DEFAULT_STATUS_FILE = 'D:\\DSH\\qqbot\\data\\memory\\status.json'
export const MODES = new Set(['off', 'shadow', 'on', 'degraded'])

export function normalizeMode(value, fallback = 'shadow') {
  const mode = String(value ?? '').trim().toLowerCase()
  return MODES.has(mode) ? mode : fallback
}

export function readStatus(file = DEFAULT_STATUS_FILE) {
  try {
    if (!existsSync(file)) return { mode: 'shadow', since: Date.now(), updatedAt: 0 }
    const parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    return {
      ...parsed,
      mode: normalizeMode(parsed.mode, 'shadow'),
    }
  } catch {
    return { mode: 'shadow', since: Date.now(), updatedAt: 0, readError: true }
  }
}

export function writeStatus(status, file = DEFAULT_STATUS_FILE) {
  const payload = { ...status, updatedAt: Date.now() }
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
  renameSync(tmp, file)
  return payload
}

export function today(now = Date.now()) {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
