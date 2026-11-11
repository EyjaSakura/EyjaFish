import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMaaJob, isValidJobId, humanReason, taskName } from '../lib/services/maa-report.js'

test('jobId 校验', () => {
  assert.equal(isValidJobId('job-20261108-120000-1'), true)
  assert.equal(isValidJobId('job-task'), false)
  assert.equal(isValidJobId(''), false)
})

test('非法/运行中/无状态跳过', () => {
  assert.equal(formatMaaJob({ id: 'job-task', status: 'done' }).skip, true)
  assert.equal(formatMaaJob({ id: 'job-20261108-120000-1', status: 'running' }).skip, true)
  assert.equal(formatMaaJob({ id: 'job-20261108-120000-1', status: '' }).skip, true)
})

test('完成态文案：任务名、耗时、原因、最后一张截图', () => {
  const r = formatMaaJob({
    id: 'job-20261108-120000-1', status: 'done', task: 'sanity', durationMs: 12345,
    reason: 'timeout', shots: ['a.png', 'b.png'],
  })
  assert.equal(r.skip, false)
  assert.equal(r.status, 'done')
  assert.equal(r.caption, '任务完成：清理智，12.3 秒，原因 任务超时')
  assert.equal(r.shot, 'b.png')
})

test('停止/失败文案', () => {
  assert.match(formatMaaJob({ id: 'job-20261108-120000-1', status: 'stopped', task: 'mail' }).caption, /任务已停止：领奖励/)
  assert.match(formatMaaJob({ id: 'job-20261108-120000-1', status: 'failed', task: 'wakeup' }).caption, /任务失败：开始唤醒/)
})

test('humanReason / taskName', () => {
  assert.equal(humanReason('ExceededLimit'), '卡在某个界面')
  assert.equal(humanReason('unknown-reason'), 'unknown-reason')
  assert.equal(humanReason(''), '')
  assert.equal(taskName('Award'), '领奖励')
  assert.equal(taskName('x'), 'x')
})
