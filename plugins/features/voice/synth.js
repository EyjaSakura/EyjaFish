// 自动抽取自 bridge.js #synthVoiceFile
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { synthesizeTts } from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

export async function synthVoiceFile({ text, bridge, defineTool, debugLog }) {
  const { audio, format } = await synthesizeTts(bridge.config, text)
  if (!audio || audio.length === 0) throw new Error('TTS 返回空音频')
  mkdirSync(bridge.ttsDir, { recursive: true })
  const base = join(bridge.ttsDir, `tts-${Date.now().toString(36)}`)
  let file = `${base}.${format === 'wav' ? 'wav' : 'mp3'}`
  writeFileSync(file, audio)
  // 本地 TTS 输出 wav：转 mp3 提升 QQ/NapCat 兼容性（可关：ttsLocalConvertToMp3=false）。
  if (format === 'wav' && bridge.config.ttsLocalConvertToMp3 !== false) {
    try {
      file = await bridge.convertToMp3(file)
    } catch (error) {
      debugLog(`tts wav→mp3 convert failed (sending wav): ${error.message}`)
    }
  }
  return { file, bytes: audio.length, format }
}
