// CLI for the PowerShell heartbeat (and manual inspection).
// Usage: node knowledge-pick.mjs --categories three-kingdoms,history [--json] [--no-record]
import { pickKnowledge } from '../../plugins/dsh-qq-onebot-bridge/lib/services/knowledge-picker.js'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const categories = String(arg('--categories', arg('--category', 'history')))
  .split(',').map((x) => x.trim()).filter(Boolean)
const record = !args.includes('--no-record')
const picked = pickKnowledge({ categories, record })
if (!picked) {
  console.error(`no knowledge for categories: ${categories.join(',')}`)
  process.exitCode = 1
} else if (args.includes('--json')) {
  console.log(JSON.stringify(picked))
} else {
  console.log(picked.text)
}
