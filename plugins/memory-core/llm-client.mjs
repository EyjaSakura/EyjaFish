// DeepSeek Flash client for shadow extraction. No live recall/on coupling.
import { parseExtraction, validateExtraction } from './llm-extract.mjs'
import { extractStageOneNodes } from './extract.mjs'

export const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions'

/**
 * @param {{ prompt?: string, apiKey?: string, fetchImpl?: any, timeoutMs?: number }} [options]
 */
export async function callDeepSeek({ prompt, apiKey, fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  if (!apiKey) throw new Error('DeepSeek API key missing')
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(DEEPSEEK_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1200,
        reasoning_effort: 'none',
      }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${text.slice(0, 200)}`)
    const json = JSON.parse(text)
    return String(json?.choices?.[0]?.message?.content ?? '')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {{ prompt?: string, apiKey?: string, subject?: string, windowId?: string, traceId?: string, turns?: any[], fetchImpl?: any }} [options]
 */
export async function extractWithDeepSeek({ prompt, apiKey, subject, windowId, traceId, turns = [], fetchImpl = fetch } = {}) {
  try {
    const raw = await callDeepSeek({ prompt, apiKey, fetchImpl })
    const nodes = validateExtraction(parseExtraction(raw), { subject, windowId, traceId, turns })
    if (nodes.length === 0) return { source: 'fallback', nodes: extractStageOneNodes({ subject, windowId, traceId, turns }) }
    return { source: 'llm', nodes }
  } catch {
    return { source: 'fallback', nodes: extractStageOneNodes({ subject, windowId, traceId, turns }) }
  }
}
