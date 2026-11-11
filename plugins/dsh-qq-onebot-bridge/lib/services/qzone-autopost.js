// 空间自动说说的调度：决定这次要不要提醒，以及下一次时间。

export const AUTOPOST_TEXT = '【系统】现在你可以发一条 QQ 空间说说，像随手记：一两句话，写你此刻的状态、看到的东西或心情，不要提这条提示。想发就用 qq_post_qzone 发；不想发就忽略。\n【只做这件事】可以顺带接上一条消息，但更早的未回复消息不要补答；也不要向主人汇报。 // [inject-scope-v2]'

/**
 * @returns {{ post: boolean, state?: object, gapMinutes?: number, reason?: string }}
 */
/** @param {{ state?: any, config?: any, now?: Date, random?: () => number }} args */
export function planAutoPost({ state = {}, config = {}, now = new Date(), random = Math.random }) {
  if (config.qzoneAutoPost === false) return { post: false, reason: 'disabled' }

  const from = Math.max(0, Number(config.qzonePostHourStart) || 9)
  const to = Math.min(24, Number(config.qzonePostHourEnd) || 23)
  const hour = now.getHours()
  if (hour < from || hour >= to) return { post: false, reason: 'outside-window' }

  if (state.mode === 'daily') {
    const hh = Math.max(0, Math.min(23, Number(state.hour) || 9))
    const today = now.toISOString().slice(0, 10)
    const due = new Date(now)
    due.setHours(hh, 0, 0, 0)
    if (now < due || state.lastDate === today) return { post: false, reason: 'not-due' }
    const minGap = Math.max(60, Number(config.qzonePostMinGapMinutes) || 240)
    const maxGap = Math.max(minGap, Number(config.qzonePostMaxGapMinutes) || 600)
    const gap = (minGap + Math.floor(random() * (maxGap - minGap))) * 60_000
    return {
      post: true,
      gapMinutes: Math.round(gap / 60000),
      state: { mode: 'daily', hour: hh, lastDate: today, nextAt: now.getTime() + gap, lastAt: now.getTime(), gapMinutes: Math.round(gap / 60000) },
    }
  }

  if (now.getTime() < (state.nextAt || 0)) return { post: false, reason: 'cooldown' }
  const minGap = Math.max(60, Number(config.qzonePostMinGapMinutes) || 240)
  const maxGap = Math.max(minGap, Number(config.qzonePostMaxGapMinutes) || 600)
  const gap = (minGap + Math.floor(random() * (maxGap - minGap))) * 60_000
  return {
    post: true,
    gapMinutes: Math.round(gap / 60000),
    state: { ...state, lastAt: now.getTime(), nextAt: now.getTime() + gap, gapMinutes: Math.round(gap / 60000) },
  }
}
