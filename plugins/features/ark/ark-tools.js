// 自动拆分自 contacts/identity.js
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync, renameSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { join, basename, dirname, extname } from 'node:path'

const maaRoot = 'D:\\DSH\\qqbot\\maa'
const maaData = join(maaRoot, 'data')
const maaQueue = join(maaRoot, 'queue')
const maaReadJson = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}
const maaStages = () => {
  try { return JSON.parse(readFileSync('C:\\MAA\\runner\\stages.json', 'utf8').replace(/^\uFEFF/, '')) } catch { return {} }
}
const MAA_HUMAN = {
  ExceededLimit: '卡在某个界面（多半是没在主界面）',
  'need-main-menu': '游戏不在主界面，请先切回主界面',
  'stuck-90s': '90 秒没进展，可能界面不对或资源过期',
  'stopped-without-completion': '进程停了但没看到完成回调',
  'attach-failed': '窗口没绑上（尺寸/权限/最小化）',
  timeout: '任务超时',
}
const maaHuman = (r) => {
  if (!r) return ''
  const k = Object.keys(MAA_HUMAN).find((x) => String(r).includes(x))
  return k ? MAA_HUMAN[k] : String(r)
}
const maaStatusText = (j) => {
  if (!j) return '还没跑过任务（没有 job.json）'
  const NAME = { wakeup: '开始唤醒', mail: '领奖励', sanity: '清理智' }
  const parts = ['任务 ' + (NAME[j.task] || j.task || '?'), '状态 ' + (j.status || '?')]
  if (j.phase) parts.push('阶段 ' + j.phase)
  if (j.durationMs != null) parts.push('耗时 ' + Math.round(j.durationMs / 1000) + 's')
  if (j.reason) parts.push('原因 ' + maaHuman(j.reason))
  if (Array.isArray(j.shots) && j.shots.length) parts.push('截图 ' + j.shots.length + ' 张')
  return parts.join('，')
}

export function registerArkTools({ agentCtx, route, key, role, bridge, defineTool, debugLog }) {
  const out = {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
    render: (_a, v) => [{ type: 'text', text: v.detail }],
  }

agentCtx.tools.register(defineTool({
    name: 'ark_status',
    description: '明日方舟 MAA：看当前/上一次任务的状态（任务名、阶段、耗时、失败原因、截图数）。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const j = maaReadJson(join(maaData, 'job.json'))
      return { detail: maaStatusText(j) }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'ark_run',
    description: '明日方舟 MAA：跑一个任务（wakeup/mail/sanity）。sanity 需要 stage 和 times。',
    parameters: { task: { type: 'string', description: 'wakeup | mail | sanity' }, stage: { type: 'string', description: 'sanity 用，例如 CE-6' }, times: { type: 'number', description: 'sanity 用，局数 1~99' }, allowMedicine: { type: 'boolean', description: '是否允许吃理智药，默认 false' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const task = String(args.task || '')
      if (!['wakeup', 'mail', 'sanity'].includes(task)) return { detail: '这个任务还不会：' + task }
      const cur = maaReadJson(join(maaData, 'job.json'))
      if (cur && cur.status === 'running') return { detail: '上一个还没跑完（' + cur.task + '），等它结束' }

      const params = { task }
      const body = {}
      if (task === 'sanity') {
        const stages = maaStages()
        let stage = String(args.stage || '')
        // [ark-current] stage=current 表示"打当前选择的关卡"，不校验白名单和 opens
        if (stage === 'current') {
          // 放行，后面跳过 opens 校验
        } else if (!stages[stage]) {
          return { detail: '这个关卡不在白名单：' + (stage || '(空)') }
        }
        // [ark-opens] 关卡开放日校验（opens 为空表示不校验）
        if (stage !== 'current') {
          const opens = Array.isArray((stages[stage] || {}).opens) ? stages[stage].opens : []
          const today = new Date().getDay() === 0 ? 7 : new Date().getDay()   // JS 周日=0 -> ISO 7
          if (opens.length && !opens.includes(today)) {
            const wd = ['一', '二', '三', '四', '五', '六', '日']
            return { detail: stage + ' 今天不开放（周' + wd[today - 1] + '），换一个关卡或等开放' }
          }
        }
        const times = Number(args.times || 0)
        if (!Number.isInteger(times) || times < 1 || times > 99) return { detail: '局数要是 1~99 的整数' }
        body.task = task
        body.params = { stage, times, allowMedicine: args.allowMedicine === true, allowStone: false }
      }

      const seqFile = join(maaData, 'seq.txt')
      let seq = 0
      try { seq = Number(readFileSync(seqFile, 'utf8').trim()) || 0 } catch { seq = 0 }
      seq += 1
      try { writeFileSync(seqFile, String(seq), 'utf8') } catch { /* 写不了就靠时间戳 */ }

      const name = 'req-' + String(seq).padStart(6, '0') + '-' + Date.now() + '.json'
      try {
        mkdirSync(maaQueue, { recursive: true })
        const payload = Object.keys(body).length ? body : { task, params: {} }
        const tmp = join(maaQueue, name + '.tmp')
        writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
        renameSync(tmp, join(maaQueue, name))
      } catch (e) {
        return { detail: '入队失败：' + String((e && e.message) || e) }
      }

      try {
        spawn('schtasks', ['/run', '/tn', 'DSH-MAA-Run'], { detached: true, stdio: 'ignore' }).unref()
      } catch (e) {
        return { detail: '入队了但没触发计划任务：' + String((e && e.message) || e) }
      }
      return { detail: '交给 MAA 了：' + task + (body.params ? '（' + body.params.stage + ' x' + body.params.times + '）' : '') }
    },
  }))

agentCtx.tools.register(defineTool({
    name: 'ark_stop',
    description: '明日方舟 MAA：让当前任务停下来（写 stop.req，worker 每秒检查）。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const cur = maaReadJson(join(maaData, 'job.json'))
      if (!cur || cur.status !== 'running') return { detail: '现在没有在跑的任务' }
      try {
        writeFileSync(join(maaData, 'stop.req'), JSON.stringify({ jobId: cur.id }), 'utf8')
      } catch (e) {
        return { detail: '写 stop.req 失败：' + String((e && e.message) || e) }
      }
      return { detail: '已经请求停下（' + (cur.task || '?') + '），最多等 15 秒' }
    },
  }))
}
