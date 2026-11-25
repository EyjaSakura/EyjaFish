// Safe owner-only canary switch. Always backs up status.json before changing it.
// Usage: node canary.mjs --on|--off [--status-file <path>]
import { copyFileSync, existsSync } from 'node:fs'
import { readStatus, writeStatus } from '../status.js'

const args = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const i = args.indexOf(name)
  return i >= 0 ? String(args[i + 1] ?? fallback) : fallback
}
const file = arg('--status-file', 'D:\\DSH\\qqbot\\data\\memory\\status.json')
const status = readStatus(file)
const next = args.includes('--off') ? 'shadow' : args.includes('--on') ? 'on' : ''
if (!next) {
  process.stdout.write(JSON.stringify({ ok: false, reason: 'use --on or --off', mode: status.mode }, null, 2) + '\n')
  process.exitCode = 2
} else {
  const backup = `${file}.bak.${Date.now()}`
  if (existsSync(file)) copyFileSync(file, backup)
  status.mode = next
  status.reason = ''
  if (next === 'on') status.canaryStartedAt = Date.now()
  else delete status.canaryStartedAt
  writeStatus(status, file)
  process.stdout.write(JSON.stringify({ ok: true, mode: next, backup, file }, null, 2) + '\n')
}
