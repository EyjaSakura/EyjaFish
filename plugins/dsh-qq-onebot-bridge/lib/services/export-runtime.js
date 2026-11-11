// /export markdown export.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { debugLog } from '../core/debug-log.js'

export async function handleExport({ bridge, message }) {
  const key = bridge.routeKey(message)
  const lines = bridge.loadMemoryLines(key)
  if (lines.length === 0) {
    await bridge.safeReply(message, '当前会话没有可导出的记录（可能刚重启或聊天太少）。')
    return
  }
  try {
    mkdirSync(bridge.exportsDir, { recursive: true })
    const name = `${String(key).replace(/[^\w-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.md`
    const file = join(bridge.exportsDir, name)
    writeFileSync(file, `# ${key} 聊天记录导出\n\n` + lines.map((l) => `- ${l}`).join('\n') + '\n', 'utf8')
    await bridge.safeReply(message, `✅ 已导出 ${lines.length} 条记录到：${file}`)
    debugLog(`export written ${file}`)
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 导出失败：${error.message.slice(0, 80)}`)
  }
}
