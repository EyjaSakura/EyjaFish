// 自动抽取自 bridge.js #handleVoiceReading
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { parseMessage, toOneBotFileSource } from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

export async function handleVoiceReading({ message, explicitText, bridge, defineTool, debugLog }) {
  let spoken = String(explicitText).trim()
  if (!spoken && message.reply?.text && message.reply.text.trim()) {
    spoken = message.reply.text.trim()
  } else if (!spoken && message.reply?.messageId) {
    try {
      const msg = await bridge.server.getMsg(message.bot, message.reply.messageId)
      const content = msg?.message
      if (Array.isArray(content) || typeof content === 'string') {
        spoken = parseMessage(content, bridge.config.botQq).text
      }
    } catch (error) {
      debugLog(`voice reading get_msg failed: ${error.message}`)
    }
  }
  if (!spoken) {
    await bridge.safeReply(message, '没有找到要朗读的文字哦～用法：@我并引用一条文字说「读一下」，或直接发 /读 要读的内容')
    return
  }
  if (spoken.length > 500) spoken = `${spoken.slice(0, 500)}……`
  try {
    const { file } = await bridge.synthVoiceFile(spoken)
    const targetId = message.messageType === 'group' ? message.groupId : message.userId
    // [voice-base64] Windows 本地路径在 WSL 的 NapCat 里不存在 → record 段发 base64
    let voiceSrc = toOneBotFileSource(file)
    try {
      if (/^[a-zA-Z]:[\\/]/.test(String(file))) voiceSrc = 'base64://' + readFileSync(file).toString('base64')
    } catch (error) {
      debugLog(`voice base64 failed, fallback to path: ${error.message}`)
    }
    await bridge.server.sendSegments(message.bot, message.messageType, targetId, [{ type: 'record', data: { file: voiceSrc } }])
    debugLog(`voice reading sent (${file})`)
  } catch (error) {
    debugLog(`voice reading failed: ${error.message}`)
    await bridge.safeReply(message, `朗读失败：${error.message.slice(0, 60)}`)
  }
}
