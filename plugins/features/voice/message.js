// 自动抽取自 bridge.js #handleVoice
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export async function handleVoice({ message, bridge, defineTool, debugLog }) {
  const record = (message.records ?? [])[0] ?? {}
  // 只有走云端（sttProvider: 'cloud'）时才要求 API Key；DSH 自带的本地识别不需要任何密钥。
  if (bridge.config.sttProvider === 'cloud' && !bridge.config.sttApiKey) {
    await bridge.safeReply(message, '⚠️ 语音转文字走的是云端，但没配 API Key（sttApiKey 为空）；也可以把 sttProvider 改成 dsh 用 DSH 自带的本地识别')
    return
  }
  try {
    const audio = await bridge.fetchVoiceAudio(message, record)
    const transcript = await bridge.transcribe(audio)
    if (!transcript) throw new Error('识别结果为空')
    debugLog(`voice transcribed (${transcript.length} chars): ${transcript.slice(0, 60)}`)
    const entry = await bridge.ensureSession(message)
    debugLog(`session ready ${entry.sessionId}`)
    const voiceText = `[语音消息] ${transcript}`
    bridge.recordMemory(bridge.routeKey(message), 'user', voiceText)
    bridge.handoff(entry, message, {
      content: [{ type: 'text', text: voiceText }],
      source: { kind: 'user' },
    })
    debugLog('followup sent (voice)')
  } catch (error) {
    debugLog(`voice STT failed: ${error.message}`)
    bridge.logger.error(`QQ voice STT failed: ${error.message}`)
    await bridge.safeReply(message, `⚠️ 语音转文字失败：${error.message}`)
  }
}
