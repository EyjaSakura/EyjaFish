import test from 'node:test'
import assert from 'node:assert/strict'

import { handleOpsCommand } from '../../features/commands/ops.js'

test('ops 拆分后：非运营命令不拦截', async () => {
  const calls = []
  const bridge = {
    config: { groupOpsEnabled: false },
    safeReply: async (message, text) => calls.push(text),
    trace: { event: () => {} },
  }
  assert.equal(await handleOpsCommand({ message: {}, text: 'hello', bridge }), false)
  assert.deepEqual(calls, [])
})

test('ops 拆分后：总开关关闭时拦截并提示', async () => {
  const calls = []
  const bridge = {
    config: { groupOpsEnabled: false },
    safeReply: async (message, text) => calls.push(text),
    trace: { event: () => {} },
  }
  assert.equal(await handleOpsCommand({ message: {}, text: '/群打卡', bridge }), true)
  assert.match(calls[0], /群运营工具箱未启用/)
})
