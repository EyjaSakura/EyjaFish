// MAA 任务结果 → 通知文案：只处理 run-job 生成的合法 id 与终态。

const REASON_MAP = {
  'need-main-menu': '游戏不在主界面，请先切回主界面',
  ExceededLimit: '卡在某个界面',
  'stuck-90s': '90 秒没进展',
  'stopped-without-completion': '没等到完成回调',
  timeout: '任务超时',
  'stopped-by-user': '按你的要求停下了',
}

const TASK_CN = {
  wakeup: '开始唤醒', mail: '领奖励', sanity: '清理智',
  Award: '领奖励', StartUp: '开始唤醒', Fight: '清理智',
  Recruit: '公开招募', Infrast: '基建换班', Mall: '信用购物',
}

export function isValidJobId(id) {
  return /^job-\d{8}-\d{6}-\d+$/.test(String(id ?? ''))
}

export function humanReason(reason) {
  if (!reason) return ''
  const k = Object.keys(REASON_MAP).find((x) => String(reason).includes(x))
  return k ? REASON_MAP[k] : String(reason)
}

export function taskName(task) {
  return TASK_CN[task] || String(task || '?')
}

/**
 * @returns {{ skip: boolean, invalid?: boolean, status?: string, caption?: string, shot?: string }}
 */
export function formatMaaJob(job) {
  if (!job || !job.id) return { skip: true }
  if (!isValidJobId(job.id)) return { skip: true, invalid: true }
  const status = String(job.status || '')
  if (status === 'running' || status === 'starting' || !status) return { skip: true }

  const what = status === 'done' ? '任务完成' : (status === 'stopped' ? '任务已停止' : '任务失败')
  const bits = [what + '：' + taskName(job.task)]
  const secs = job.durationMs != null ? (Math.round(job.durationMs / 100) / 10) : null
  if (secs != null) bits.push(secs + ' 秒')
  if (job.reason) bits.push('原因 ' + humanReason(job.reason))
  const shots = Array.isArray(job.shots) ? job.shots : []
  return {
    skip: false,
    status,
    caption: bits.join('，'),
    shot: shots.length ? shots[shots.length - 1] : '',
  }
}
