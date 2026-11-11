/**
 * TTS synthesis: Azure Speech (SSML), any OpenAI-compatible /audio/speech endpoint,
 * a local GPT-SoVITS api_v2 server (zero-shot voice cloning),
 * or the local edge-tts CLI (Python, no key).
 * Returns { audio: Buffer, format: 'mp3' | 'wav' }.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildAzureSsml(text, voice, style) {
  const styleAttr = style ? ` style="${escapeXml(style)}"` : ''
  return `<speak version="1.0" xml:lang="zh-CN"><voice name="${escapeXml(voice)}"${styleAttr}>${escapeXml(text)}</voice></speak>`
}

/** Build the JSON body for a GPT-SoVITS api_v2 POST /tts request (pure, testable). */
export function buildLocalTtsRequest(config, text) {
  return {
    text,
    text_lang: config.ttsLocalTextLang || 'zh',
    ref_audio_path: config.ttsLocalRefAudio || '',
    prompt_text: config.ttsLocalPromptText || '',
    prompt_lang: config.ttsLocalPromptLang || 'zh',
    media_type: 'wav',
    streaming_mode: 0,
  }
}

/**
 * [edge-tts 2026-10-31] 念白/念诗的停顿。
 *
 * edge-tts 的在线接口不吃 SSML 的 <break>（rany2/edge-tts#83），能让它真停顿的只有标点。
 * 所以合成前把标点后面的句子断开成多行 —— 行与行之间它会给一个明显的气口，
 * 念诗才不会一口气秃噜下来。别往这里加 <break>，加了会原样念出来。
 */
export function edgePauseText(text) {
  const raw = String(text ?? '').replace(/\r/g, '')
  const paced = raw
    .replace(/([，。！？；：、,.!?;:…])/g, '$1\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  return paced === '' ? raw : paced
}

/** 用本机的 edge-tts CLI（Python）合成，不需要任何 key。 */
async function synthesizeEdge(config, text) {
  const dir = mkdtempSync(join(tmpdir(), 'edge-tts-'))
  const txtFile = join(dir, 'in.txt')
  const media = join(dir, 'out.mp3')
  try {
    writeFileSync(txtFile, edgePauseText(text), 'utf8')
    const py = process.env.EDGE_TTS_PYTHON || process.env.PYTHON || 'python'
    const args = [
      '-m', 'edge_tts',
      '--voice', String(config.ttsVoice || 'zh-CN-XiaoyiNeural'),
      '--rate=' + String(config.ttsEdgeRate || '+0%'),
      '--pitch=' + String(config.ttsEdgePitch || '+0Hz'),
      '--file', txtFile,
      '--write-media', media,
    ]
    await execFileAsync(py, args, { timeout: 90_000, windowsHide: true })
    const audio = readFileSync(media)
    if (audio.length === 0) throw new Error('edge-tts 输出为空')
    return { audio, format: 'mp3' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Synthesize text to audio bytes according to the bridge TTS config. */
export async function synthesizeTts(config, text) {
  if (config.ttsProvider === 'edge') return synthesizeEdge(config, text)
  if (config.ttsProvider === 'openai') {
    const base = String(config.ttsBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const response = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ttsApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: config.ttsModel || 'tts-1', voice: config.ttsVoice || 'alloy', input: text }),
      signal: AbortSignal.timeout(60000),
    })
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 120)}`)
    return { audio: Buffer.from(await response.arrayBuffer()), format: 'mp3' }
  }
  if (config.ttsProvider === 'local') {
    // Local GPT-SoVITS api_v2: POST /tts returns raw wav bytes (or a JSON error).
    const base = String(config.ttsLocalUrl || 'http://127.0.0.1:9880').replace(/\/+$/, '')
    const response = await fetch(`${base}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildLocalTtsRequest(config, text)),
      signal: AbortSignal.timeout(180000), // [lazy-tts] 懒加载后端首次需等模型加载
    })
    if (!response.ok) {
      let detail = ''
      try { detail = (await response.json()).message ?? '' } catch { detail = await response.text().catch(() => '') }
      throw new Error(`本地 TTS HTTP ${response.status}: ${String(detail).slice(0, 120)}`)
    }
    return { audio: Buffer.from(await response.arrayBuffer()), format: 'wav' }
  }
  // Azure Speech REST (SSML)
  const region = config.ttsAzureRegion || 'eastasia'
  const voice = config.ttsVoice || 'zh-CN-XiaoxiaoNeural'
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.ttsApiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'dsh-qq-onebot-bridge',
    },
    body: buildAzureSsml(text, voice, config.ttsStyle || ''),
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`Azure TTS HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 120)}`)
  return { audio: Buffer.from(await response.arrayBuffer()), format: 'mp3' }
}
