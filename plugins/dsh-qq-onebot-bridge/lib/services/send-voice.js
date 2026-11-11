// 合成并发送语音（Windows 路径转 base64，避免 WSL NapCat 读不到）。
/** @param {any} args */
export async function sendVoiceTo({
  route,
  text,
  config = {},
  ttsUsable,
  synthVoiceFile,
  toOneBotFileSource,
  readFile,
  sendSegments,
  trackSent,
  chatKeyOf,
  debugLog = () => {},
}) {
  if (!ttsUsable()) throw new Error('未配置 TTS（ttsApiKey 或 ttsLocalRefAudio 为空）')
  const max = Math.max(10, Number(config.ttsMaxChars) || 120)
  const spoken = text.length > max ? `${text.slice(0, max)}……` : text
  const { file, bytes } = await synthVoiceFile(spoken)
  // [voice-base64] Windows 本地路径在 WSL 的 NapCat 里不存在 → record 段发 base64
  let voiceSrc = toOneBotFileSource(file)
  try {
    if (/^[a-zA-Z]:[\\/]/.test(String(file))) voiceSrc = 'base64://' + readFile(file).toString('base64')
  } catch (error) {
    debugLog(`voice base64 failed, fallback to path: ${error.message}`)
  }
  const data = await sendSegments(route.bot, route.messageType, route.targetId, [{ type: 'record', data: { file: voiceSrc } }])
  trackSent(chatKeyOf(route), data)
  debugLog(`agent voice sent (${bytes} bytes)`)
  return `已发送语音（${Math.round(bytes / 1024)} KB）`
}
