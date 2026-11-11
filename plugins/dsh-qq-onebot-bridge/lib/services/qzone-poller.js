// 空间评论轮询 / 自动发说说：I/O 与注入都通过依赖传入，便于单测。
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { qzoneCommentPrompt, scanQzoneComments } from './qzone-comments.js'
import { AUTOPOST_TEXT, planAutoPost } from './qzone-autopost.js'

/** @param {{ config?: any, memoryDir: string, fetchList: any, ownerQQ: () => any, setSelfState: any, handleInjection: any, debugLog?: (message: string) => void, now?: () => number }} args */
export async function pollQzoneComments({
  config,
  memoryDir,
  fetchList,
  ownerQQ,
  setSelfState,
  handleInjection,
  debugLog = () => {},
  now = () => Date.now(),
}) {
  if (config.qzoneAutoReply === false) return
  try {
    const { list, uin } = await fetchList(Math.max(3, Math.min(10, Number(config.qzonePollCount) || 5)))
    const seenFile = join(memoryDir, '..', 'qq-qzone-seen.json')
    let seen = []
    try {
      const v = JSON.parse(readFileSync(seenFile, 'utf8'))
      seen = Array.isArray(v) ? v : []
    } catch { seen = [] }
    const owner = ownerQQ()
    const { pending, seen: nextSeen } = scanQzoneComments({
      list,
      seen,
      uin,
      now: now(),
      windowHours: config.qzoneReplyWindowHours,
    })
    if (pending.length > 0 && owner) {
      setSelfState('看空间', '空间有新评论', '')
      const text = qzoneCommentPrompt(pending)
      try {
        const prev = config.injectDryRun
        config.injectDryRun = false
        await handleInjection('message', { messageType: 'private', userId: Number(owner), groupId: null, messageId: 'qzone-poll-' + now(), text })
        config.injectDryRun = prev
        debugLog('[qzone-poll] injected ' + pending.length + ' comment(s)')
      } catch (error) {
        debugLog('[qzone-poll] inject failed: ' + error.message)
      }
    }
    writeFileSync(seenFile, JSON.stringify(nextSeen, null, 2), 'utf8')
  } catch (error) {
    debugLog('[qzone-poll] poll failed: ' + error.message)
  }
}

/** @param {{ config?: any, memoryDir: string, ownerQQ: () => any, handleInjection: any, debugLog?: (message: string) => void, now?: Date }} args */
export async function maybeAutoPostQzone({
  config,
  memoryDir,
  ownerQQ,
  handleInjection,
  debugLog = () => {},
  now = new Date(),
}) {
  const owner = ownerQQ()
  if (!owner) return
  const file = join(memoryDir, '..', 'qq-qzone-autopost.json')
  let state = { nextAt: 0 }
  try {
    state = JSON.parse(readFileSync(file, 'utf8'))
  } catch { state = { nextAt: 0 } }
  const plan = planAutoPost({ state, config, now })
  if (!plan.post) return
  try { writeFileSync(file, JSON.stringify(plan.state, null, 2), 'utf8') } catch { /* ignore */ }
  try {
    const prev = config.injectDryRun
    config.injectDryRun = false
    await handleInjection('message', { messageType: 'private', userId: Number(owner), groupId: null, messageId: 'qzone-autopost-' + now.getTime(), text: AUTOPOST_TEXT })
    config.injectDryRun = prev
    debugLog('[qzone-autopost] nudged, next in ' + plan.gapMinutes + ' min')
  } catch (error) {
    debugLog('[qzone-autopost] nudge failed: ' + error.message)
  }
}
