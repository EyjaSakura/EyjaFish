// 自动抽取自 bridge.js #sendTts
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { toOneBotFileSource } from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

export async function sendTts({ route, text, bridge, defineTool, debugLog }) {
  /**
   * TTS 以前只写 debug 日志，trace/控制台里一个字都没有——"为什么没语音"根本查不到，
   * 这违反 v0.4 硬约束①（无静默分支必带 reason）。现在每条分支都写 trace；
   * 同一原因 5 分钟内只记一次，避免本地 TTS 没开时每次回复都刷屏。
   */
  const note = (ok, reason, level = 'info') => {
    const now = Date.now()
    if (ok !== true && bridge.ttsNoteReason === reason && now - bridge.ttsNotedAt < 300_000) return
    bridge.ttsNoteReason = ok === true ? '' : reason
    bridge.ttsNotedAt = now
    bridge.trace?.event({ id: '', stage: 'tts', ok, reason, level })
  }
  try {
    // [edge-tts 2026-10-31] edge / sapi 不需要 key（本地 CLI / 系统语音），别被这条闸门挡住
    const keylessTts = bridge.config.ttsProvider === 'local' || bridge.config.ttsProvider === 'edge' || bridge.config.ttsProvider === 'sapi'
    if (!keylessTts && !bridge.config.ttsApiKey) {
      debugLog('tts skipped: no ttsApiKey')
      note(false, '未发语音：ttsProvider 需要 ttsApiKey 但没配')
      return
    }
    if (bridge.config.ttsProvider === 'local' && !bridge.config.ttsLocalRefAudio) {
      debugLog('tts skipped: ttsProvider=local but ttsLocalRefAudio is empty')
      note(false, '未发语音：ttsProvider=local 但没配 ttsLocalRefAudio（参考音频）')
      return
    }
    const max = Math.max(10, Number(bridge.config.ttsMaxChars) || 120)
    const spoken = text.length > max ? `${text.slice(0, max)}……` : text
    const { file, bytes, format } = await bridge.synthVoiceFile(spoken)
    const socket = bridge.server.currentSocket()
    if (!socket) {
      debugLog('tts skipped: no socket')
      note(false, '未发语音：当前没有可用的 OneBot 连接（QQ 掉线）')
      return
    }
    // [voice-base64] Windows 本地路径在 WSL 的 NapCat 里不存在 → record 段发 base64
    let voiceSrc = toOneBotFileSource(file)
    try {
      if (/^[a-zA-Z]:[\\/]/.test(String(file))) voiceSrc = 'base64://' + readFileSync(file).toString('base64')
    } catch (error) {
      debugLog(`voice base64 failed, fallback to path: ${error.message}`)
    }
    await bridge.server.sendSegments(socket, route.messageType, route.targetId, [{ type: 'record', data: { file: voiceSrc } }])
    debugLog(`tts sent (${bytes} bytes, ${format})`)
    note(true, `语音已发送（${Math.round(bytes / 1024)} KB，${format}）`)
  } catch (error) {
    debugLog(`tts failed: ${error.message}`)
    bridge.logger.error(`QQ tts failed: ${error.message}`)
    // 本地 GPT-SoVITS/云端接口没起时就是这条：给真原因，别让它只躺在调试日志里。
    note(false, `语音合成/发送失败：${error.message}`, 'warn')
  }
}
