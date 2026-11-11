import test from 'node:test'
import assert from 'node:assert/strict'
import { saveFaceToQq } from '../lib/services/face-save.js'

function harness(overrides = {}) {
  const calls = []
  const item = { file: 'D:/a.png', name: '猫', md5: 'm' }
  const deps = {
    item,
    dirWin: 'D:/tmp',
    server: {
      currentSocket: () => ({}),
      action: async (sock, action) => {
        calls.push(action)
        if (action === 'fetch_custom_face_detail') {
          return calls.filter((x) => x === action).length === 1
            ? { emojiInfoList: [{ res_id: '1' }] }
            : { emojiInfoList: [{ res_id: '1' }, { res_id: '2', emoji_id: 7, md5: 'm2', url: 'u' }] }
        }
        return {}
      },
    },
    faces: { save: () => calls.push('save') },
    mkdir: (dir, opts) => calls.push(['mkdir', dir, opts.recursive]),
    writeFile: (file, data) => calls.push(['write', file, String(data)]),
    readFile: () => Buffer.from('x'),
    now: 1000,
    debugLog: (m) => calls.push(['log', m]),
    ...overrides,
  }
  return { deps, calls, item }
}

test('无 item / 无 socket', async () => {
  assert.equal(await saveFaceToQq(harness({ item: null }).deps), false)
  const noSock = harness({ server: { currentSocket: () => null, action: async () => {} } })
  assert.equal(await saveFaceToQq(noSock.deps), false)
})

test('成功保存并回填 resId/emojiId', async () => {
  const h = harness()
  assert.equal(await saveFaceToQq(h.deps), true)
  assert.equal(h.calls.some((c) => Array.isArray(c) && c[0] === 'mkdir' && c[2] === true), true)
  assert.equal(h.item.qqResId, '2')
  assert.equal(h.item.qqEmojiId, 7)
  assert.equal(h.item.qqUrl, 'u')
  assert.equal(h.calls.includes('save'), true)
})

test('action 抛错返回 false 并记日志', async () => {
  const h = harness({
    server: { currentSocket: () => ({}), action: async () => { throw new Error('napcat') } },
  })
  assert.equal(await saveFaceToQq(h.deps), false)
  assert.equal(h.calls.some((c) => Array.isArray(c) && c[0] === 'log' && /failed/.test(c[1])), true)
})

test('没有新表情时也保存成功', async () => {
  const h = harness({
    server: {
      currentSocket: () => ({}),
      action: async (sock, action) => ({ emojiInfoList: [{ res_id: '1' }] }),
    },
  })
  assert.equal(await saveFaceToQq(h.deps), true)
  assert.equal(h.item.qqResId, undefined)
})
