// 抖音私信 inbox 轮询：按字节 offset 增量读取，转成注入提示后交给 agent。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import { buildDouyinPrompt } from './douyin-prompt.js'

/** @param {any} args */
export async function pollDouyinInbox({
  inbox,
  offsetFile,
  configFile,
  ownerQQ,
  transcribe,
  handleInjection,
  setReplyTarget,
  config,
  debugLog = () => {},
  now = () => Date.now(),
}) {
  if (!existsSync(inbox)) return
  let offset = 0
  try { offset = Number(JSON.parse(readFileSync(offsetFile, 'utf8')).offset) || 0 } catch { offset = 0 }
  let raw = ''
  try { raw = readFileSync(inbox, 'utf8') } catch { return }
  if (raw.length <= offset) return
  const chunk = raw.slice(offset)
  try { writeFileSync(offsetFile, JSON.stringify({ offset: raw.length }), 'utf8') } catch { /* best effort */ }
  const owner = ownerQQ()
  if (!owner) return
  const prevDryRun = config.injectDryRun
  let pending = 0
  for (const line of chunk.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let item = null
    try { item = JSON.parse(t) } catch { continue }
    const text = String(item.text ?? '').trim()
    const hasMedia = Boolean(item.videoPath || item.videoUrl || item.voicePath || (Array.isArray(item.images) && item.images.length))
    if (!text && !hasMedia) continue
    let peers = {}
    try { peers = JSON.parse(readFileSync(configFile, 'utf8')).peers || {} } catch { peers = {} }
    const nick = String(item.peer || '')
    const info = peers[nick] || {}
    const label = nick + (info.note ? '（' + info.note + (info.qq ? '，QQ ' + info.qq : '') + '）' : '')
    let voiceText = ''
    if (item.voicePath) {
      try {
        const b64 = readFileSync(String(item.voicePath)).toString('base64')
        voiceText = await transcribe({ base64: b64, ext: extname(String(item.voicePath)).replace(/^\./, '') || 'mpeg' })
        debugLog('[douyin] voice transcribed ' + voiceText.length + ' chars')
      } catch (error) {
        debugLog('[douyin] voice transcribe failed: ' + error.message)
      }
    }
    const images = Array.isArray(item.images) ? item.images.filter((x) => typeof x === 'string' && x) : []
    const prompt = buildDouyinPrompt({ item, label, nick, text, voiceText, images })
    setReplyTarget({ peer: nick, at: now() })
    config.injectDryRun = false
    pending += 1
    void handleInjection('message', { messageType: 'private', userId: Number(owner), groupId: null, messageId: 'douyin-' + now(), text: prompt, images })
      .catch((e) => debugLog('[douyin] inject failed: ' + e.message))
      .finally(() => {
        pending -= 1
        if (pending === 0) config.injectDryRun = prevDryRun
      })
  }
}
