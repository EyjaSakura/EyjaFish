// CLI for the PowerShell heartbeat (and manual inspection).
// Usage: node knowledge-pick.mjs --categories three-kingdoms,history [--json] [--no-record] [--out file]
import { writeFileSync } from 'node:fs'
import { pickKnowledge } from '../../plugins/dsh-qq-onebot-bridge/lib/services/knowledge-picker.js'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const categories = String(arg('--categories', arg('--category', 'history')))
  .split(',').map((x) => x.trim()).filter(Boolean)
const record = !args.includes('--no-record')
const outFile = arg('--out', '')
const picked = pickKnowledge({ categories, record })
if (!picked) {
  console.error(`no knowledge for categories: ${categories.join(',')}`)
  process.exitCode = 1
} else {
  const json = JSON.stringify(picked)
  if (outFile) writeFileSync(outFile, json, 'utf8')
  if (args.includes('--json')) console.log(json)
  else console.log(picked.text)
}
