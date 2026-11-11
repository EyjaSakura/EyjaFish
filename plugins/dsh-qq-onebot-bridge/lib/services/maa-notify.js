// MAA 任务状态通知：读 job.json，状态变化时给主人发截图或文字。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatMaaJob } from './maa-report.js'

/**
 * @param {{ maaData: string, server: any, ownerQQ: () => number, sendImageTo: (route: any, shot: string, caption: string) => Promise<any>, debugLog?: (message: string) => void }} args
 */
export async function maaNotifyTick({ maaData, server, ownerQQ, sendImageTo, debugLog = () => {} }) {
  try {
    const jobPath = join(maaData, 'job.json')
    const notifiedPath = join(maaData, 'notified.json')
    if (!existsSync(jobPath)) return

    let job = null
    try { job = JSON.parse(readFileSync(jobPath, 'utf8').replace(/^\uFEFF/, '')) } catch { return }
    if (!job || !job.id) return
    const parsed = formatMaaJob(job)
    if (parsed.skip) {
      if (parsed.invalid) debugLog('[maa-notify] skip invalid jobId: ' + job.id)
      return
    }
    const { status, caption, shot } = parsed
    let notified = {}
    try { notified = JSON.parse(readFileSync(notifiedPath, 'utf8').replace(/^\uFEFF/, '')) } catch { notified = {} }
    if (notified.jobId === job.id && notified.status === status) return

    const sock = server.currentSocket()
    if (!sock) return
    const owner = ownerQQ()
    if (!owner) return
    const route = { bot: sock, messageType: 'private', targetId: Number(owner) }

    let sentImage = false
    try {
      if (shot && existsSync(shot)) {
        await sendImageTo(route, shot, caption)
        sentImage = true
      }
    } catch (e) {
      debugLog('[maa-notify-image] send image failed: ' + (e && e.message))
      sentImage = false
    }
    if (!sentImage) {
      try {
        await server.sendText(sock, 'private', Number(owner), shot ? (caption + '\n' + shot) : caption)
      } catch (e) {
        debugLog('[maa-notify-image] send text failed: ' + (e && e.message))
        return
      }
    }
    try {
      writeFileSync(notifiedPath, JSON.stringify({ jobId: job.id, status, at: new Date().toISOString() }), 'utf8')
    } catch { /* 写不了就下次可能重发，可接受 */ }
    debugLog('[maa-notify] sent ' + job.id + ' ' + status)
  } catch (e) {
    debugLog('[maa-notify] failed: ' + (e && e.message))
  }
}
