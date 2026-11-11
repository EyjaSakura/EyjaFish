// 语音转写：DSH 本地服务（含首次模型准备）或 OpenAI 兼容云端接口。
import { DEFAULT_STT_LANGUAGE, DSH_SPEECH_SERVICE, explainDshError, toWav16k, transcribeViaDsh } from '../stt.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** @param {any} args */
export async function transcribe({
  audio,
  config = {},
  ttsDir,
  resolveService,
  debugLog = () => {},
  sleepImpl = sleep,
  fetchImpl = fetch,
}) {
  if (config.sttProvider === 'cloud') return transcribeViaCloud({ audio, config, fetchImpl })
  try {
    const wav = await toWav16k({
      buffer: Buffer.from(audio.base64, 'base64'),
      ext: audio.ext,
      ffmpegPath: config.ffmpegPath || 'ffmpeg',
      tmpDir: ttsDir,
    })
    try {
      const svc = resolveService(DSH_SPEECH_SERVICE)
      const snap = typeof svc?.snapshot === 'function' ? svc.snapshot() : null
      const pid = snap?.selection?.providerId
      const phase = snap?.providers?.find((p) => p.id === pid)?.preparation?.phase
      if (pid && phase !== 'ready' && typeof svc.prepare === 'function') {
        debugLog(`stt prepare start provider=${pid} phase=${phase}`)
        await svc.prepare(pid, {})
        for (let i = 0; i < 600; i += 1) {
          await sleepImpl(2000)
          const s2 = typeof svc.snapshot === 'function' ? svc.snapshot() : null
          const p2 = s2?.providers?.find((p) => p.id === pid)?.preparation
          if (p2?.phase === 'ready') { debugLog('stt prepare ready'); break }
          if (p2?.phase === 'failed') { debugLog('stt prepare failed: ' + JSON.stringify(p2).slice(0, 200)); break }
          if (i % 15 === 0) debugLog('stt prepare wait phase=' + JSON.stringify(p2?.steps ?? p2?.phase).slice(0, 160))
        }
      }
    } catch (error) { debugLog('stt prepare failed: ' + error.message) }
    const text = await transcribeViaDsh({
      service: resolveService(DSH_SPEECH_SERVICE),
      wav,
      language: config.sttLanguage || DEFAULT_STT_LANGUAGE,
    })
    debugLog(`stt(dsh) ok: ${text.length} chars`)
    return text
  } catch (error) {
    debugLog(`stt(dsh) failed: ${error.message}`)
    throw new Error(explainDshError(error))
  }
}

/** @param {any} args */
export async function transcribeViaCloud({ audio, config = {}, fetchImpl = fetch }) {
  const base = String(config.sttBaseUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('未配置 sttBaseUrl')
  const url = `${base}/audio/transcriptions`
  const ext = audio.ext === 'wav' ? 'wav' : 'mp3'
  const mime = ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
  const form = new FormData()
  form.append('model', config.sttModel || 'glm-asr-2512')
  form.append('file', new Blob([Buffer.from(audio.base64, 'base64')], { type: mime }), `audio.${ext}`)
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.sttApiKey}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200)
    throw new Error(`STT HTTP ${response.status}: ${detail}`)
  }
  const data = await response.json()
  const text = String(data?.text ?? '').trim()
  if (!text) throw new Error(`STT 返回为空: ${JSON.stringify(data).slice(0, 120)}`)
  return text
}
