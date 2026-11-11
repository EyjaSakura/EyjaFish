import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { buildMemoryBlockV2, buildSharedMemoryBlock } from '../lib/services/memory-blocks.js'

function memFs(files) {
  return {
    files,
    exists: (f) => Object.prototype.hasOwnProperty.call(files, f),
    readFile: (f) => files[f],
    writeFile: (f, v) => { files[f] = v },
    appendFile: () => {},
  }
}

const DIR = 'D:\\mem'
const flag = DIR + '\\USE_V2'
const factsFile = DIR + '\\facts.json'
const digestFile = DIR + '\\index\\digest.json'
const recall = 'D:\\recall.json'

test('v2：没有 USE_V2 返回空', () => {
  const fs = memFs({})
  assert.equal(buildMemoryBlockV2({ dir: DIR, count: 3, ...fs }), '')
})

test('v2：事实排序与低置信标记、项目摘要', () => {
  const fs = memFs({
    [flag]: '',
    [factsFile]: JSON.stringify({ facts: [
      { id: 'f1', status: 'active', claim: '普通事实', confidence: 0.9, subject: 'x', recorded_at: 1 },
      { id: 'f2', status: 'active', claim: '主人身份', confidence: 0.3, subject: 'person.owner', recorded_at: 2 },
      { id: 'f3', status: 'rejected', claim: '不要' },
    ] }),
    [digestFile]: JSON.stringify({ proj: { summary: '项目摘要' } }),
  })
  const out = buildMemoryBlockV2({ dir: DIR, count: 3, ...fs, env: { QQ_MEMORY_PROJECT: 'proj', QQ_RECALL_LOG: recall } })
  assert.match(out, /项目摘要/)
  assert.match(out, /主人身份（不确定）/)
  assert.ok(out.indexOf('主人身份') < out.indexOf('普通事实'))
})

test('v2：没有 active 事实返回空', () => {
  const fs = memFs({ [flag]: '', [factsFile]: JSON.stringify({ facts: [{ id: 'x', status: 'rejected', claim: 'x' }] }) })
  assert.equal(buildMemoryBlockV2({ dir: DIR, count: 1, ...fs }), '')
})

test('legacy：跳过 test/rejected，pending 标记', () => {
  const fs = memFs({
    'D:\\shared.json': JSON.stringify({ facts: [
      { text: '测试', test: true },
      { text: '丢弃', status: 'rejected' },
      { text: '待确认', status: 'pending' },
      { text: '正常' },
    ] }),
  })
  const out = buildSharedMemoryBlock({
    file: 'D:\\shared.json', chatKey: 'u:1', count: 2, createHash,
    env: { QQ_RECALL_LOG: recall }, ...fs,
  })
  assert.match(out, /（待确认）待确认/)
  assert.match(out, /- 正常/)
  assert.doesNotMatch(out, /测试/)
  assert.doesNotMatch(out, /丢弃/)
})

test('legacy：文件缺失返回空', () => {
  const fs = memFs({})
  assert.equal(buildSharedMemoryBlock({ file: 'D:\\none', chatKey: '', count: 1, createHash, ...fs }), '')
})


test('v2：700 字预算内截断，不抛错', () => {
  const facts = Array.from({ length: 20 }, (_, i) => ({ id: 'f' + i, status: 'active', claim: 'x'.repeat(80), confidence: 1, recorded_at: i }))
  const fs = memFs({ [flag]: '', [factsFile]: JSON.stringify({ facts }), [digestFile]: '{}' })
  const out = buildMemoryBlockV2({ dir: DIR, count: 1, ...fs, env: { QQ_RECALL_LOG: recall } })
  assert.ok(out.length < 1200)
  assert.match(out, /- /)
})

test('v2：recall 日志坏了也不影响输出', () => {
  const fs = memFs({
    [flag]: '',
    [factsFile]: JSON.stringify({ facts: [{ id: 'f1', status: 'active', claim: '事实' }] }),
    [digestFile]: '{}',
    [recall]: 'not json',
  })
  const out = buildMemoryBlockV2({ dir: DIR, count: 1, ...fs, env: { QQ_RECALL_LOG: recall } })
  assert.match(out, /事实/)
})

test('legacy：40 条上限与预算生效', () => {
  const facts = Array.from({ length: 60 }, (_, i) => ({ text: 'y'.repeat(20) + i }))
  const fs = memFs({ 'D:\shared.json': JSON.stringify({ facts }) })
  const out = buildSharedMemoryBlock({
    file: 'D:\shared.json', chatKey: '', count: 1, createHash,
    env: { QQ_RECALL_LOG: recall }, ...fs,
  })
  assert.ok((out.match(/^- /gm) || []).length <= 40)
  assert.ok(out.length < 1200)
})

test('legacy：facts 不是数组时返回空', () => {
  const fs = memFs({ 'D:\shared.json': JSON.stringify({ facts: 'x' }) })
  assert.equal(buildSharedMemoryBlock({ file: 'D:\shared.json', chatKey: '', count: 1, createHash, ...fs }), '')
})
