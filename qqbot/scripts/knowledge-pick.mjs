// CLI for the PowerShell heartbeat (and manual inspection).
// Usage: node knowledge-pick.mjs --category history [--json] [--no-record]
import { pickKnowledge } from '../../plugins/dsh-qq-onebot-bridge/lib/services/knowledge-picker.js'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const category = String(arg('--category', 'history'))
const record = !args.includes('--no-record')
const picked = pickKnowledge({ category, record })
if (!picked) {
  console.error(`no knowledge for category: ${category}`)
  process.exitCode = 1
} else if (args.includes('--json')) {
  console.log(JSON.stringify(picked))
} else {
  console.log(picked.text)
}
