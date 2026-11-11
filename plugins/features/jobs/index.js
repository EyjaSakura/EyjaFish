// 抖音视频分析结果轮询：把完成结果注入回主人会话，让她继续回复
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const PENDING = 'D:\\DSH\\qqbot\\douyin\\dm-pending.jsonl'
const RESULTS = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'

export async function pollAnalyzeResults({ ownerQQ, inject, getDryRun, setDryRun, debugLog }) {
  const pending = 'D:\\DSH\\qqbot\\douyin\\dm-pending.jsonl'
  const results = 'D:\\DSH\\qqbot\\douyin\\dm-results.jsonl'
  if (!existsSync(pending) || !existsSync(results)) return
  let pend = []
  try {
    const rawPend = readFileSync(pending, 'utf8').replace(/^\uFEFF/, '')
    for (const line of rawPend.split(/\r?\n/)) {
      if (!line.trim()) continue
      try { pend.push(JSON.parse(line)) } catch (e) { debugLog('[async-analyze] bad pending line: ' + line.slice(0, 80)) }
    }
  } catch (e) { debugLog('[async-analyze] read pending failed: ' + e.message); return }
  if (!pend.length) return
  let lines = []
  try { lines = readFileSync(results, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean) } catch (e) { debugLog('[async-analyze] read results failed: ' + e.message); return }
  const byId = new Map()
  for (const line of lines) { try { const j = JSON.parse(line); if (j && j.id) byId.set(j.id, j) } catch { /* ignore */ } }
  const done = []
  for (const p of pend) {
    const item = byId.get(p.id)
    if (!item) continue
    const d = item.data || {}
    const parts = []
    if (!item.ok) parts.push('分析失败：' + (item.reason || '未知'))
    if (d.deep && d.deep.summary) parts.push('内容：' + d.deep.summary)
    if (d.title) parts.push('标题：' + d.title)
    if (d.transcript) parts.push('语音：' + String(d.transcript).slice(0, 300))
    const text = '【视频分析完成】' + (parts.join('\n') || '没拿到内容') + '\n\n根据上面的内容回一句。如果这是抖音私信里的请求，用 douyin_send 回；如果是 QQ 里发的链接，直接在这里回。'
    const owner = ownerQQ()
    if (owner) {
      const prev = getDryRun()
      setDryRun(false)
      void inject({ messageType: 'private', userId: Number(owner), groupId: null, messageId: 'an-done-' + p.id, text })
        .catch((e) => debugLog('[async-analyze] inject failed: ' + e.message))
        .finally(() => { setDryRun(prev) })
    }
    done.push(p.id)
    debugLog('[async-analyze] delivered ' + p.id)
  }
  if (done.length) {
    const remain = pend.filter((p) => !done.includes(p.id))
    try { writeFileSync(pending, remain.map((x) => JSON.stringify(x)).join('\n') + (remain.length ? '\n' : ''), 'utf8') } catch { /* ignore */ }
  }
}

export const hooks = { pollAnalyzeResults }
