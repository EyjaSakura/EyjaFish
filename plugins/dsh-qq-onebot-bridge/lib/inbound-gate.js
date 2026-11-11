// 自动抽取自 bridge.js #onQqMessage
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export async function onQqMessage({ message, bridge, defineTool, debugLog }) {
  if (bridge.stopped) return
  if (bridge.config.recordInbound !== false && message.__injected !== true && message.__replayed !== true) bridge.inbox.record('message', message)
  try {
    await bridge.onQqMessageInner(message)
  } catch (error) {
    debugLog(`unhandled error: ${error.message}`)
    bridge.logger.error(`QQ message handler error: ${error.message}`)
    // 兜底也说人话（v0.5.9 真机抓到）：以前这里直接把原始报错贴进群里
    // （`⚠️ 处理失败：OneBot action set_group_admin failed: {"status":"failed",…}`）。
    await bridge.safeReply(message, `⚠️ ${bridge.actionErrorReason(error, '处理')}`)
  }
}
