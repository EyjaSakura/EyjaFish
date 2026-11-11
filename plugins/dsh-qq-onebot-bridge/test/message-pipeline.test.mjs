import test from 'node:test'
import assert from 'node:assert/strict'
import { onQqMessageInner } from '../lib/message-pipeline.js'

function makeBridge(overrides = {}) {
  const calls = { help: 0, snapshots: 0 }
  const base = {
    config: {
      allowUsers: [1],
      allowGroups: [],
      pointsEnabled: false,
      statsEnabled: false,
      verifyEnabled: false,
      antiRecallEnabled: false,
      filterEnabled: false,
      floodEnabled: false,
      autoCollectStickers: false,
      dedupWindowSeconds: 300,
    },
    quietRanges: [],
    archive: null,
    beginTrace: () => ({ mark: () => {} }),
    allowed: () => true,
    markSeen: () => {},
    chatKeyOf: () => 'u:1',
    routeOf: () => ({ messageType: 'private', targetId: 1 }),
    duplicate: () => false,
    awardMessagePoints: () => {},
    recordStats: () => {},
    rememberText: () => {},
    countOps: () => {},
    engagePassive: async () => {},
    textMentionName: async () => '',
    stripSelfMention: (m, t) => t,
    handleIncomingVideo: async () => {},
    collectSticker: () => {},
    handleJoinAnswer: async () => false,
    handleContentFilter: async () => false,
    handleHelp: async () => { calls.help += 1 },
    writeRuntimeSnapshot: () => { calls.snapshots += 1 },
    safeReply: async () => {},
    trace: { event: () => {} },
    logger: { warn: () => {} },
    ...overrides,
  }
  return { bridge: base, calls }
}

const msg = () => ({ messageType: 'private', userId: 1, text: '/help', messageId: 'm1', senderName: 'tester' })

test('白名单外：不处理 /help', async () => {
  const { bridge, calls } = makeBridge({ allowed: () => false })
  await onQqMessageInner({ message: msg(), bridge, defineTool: () => {}, debugLog: () => {} })
  assert.equal(calls.help, 0)
  assert.equal(calls.snapshots, 1)
})

test('/help 命令进入 handleHelp', async () => {
  const { bridge, calls } = makeBridge()
  await onQqMessageInner({ message: msg(), bridge, defineTool: () => {}, debugLog: () => {} })
  assert.equal(calls.help, 1)
})

test('静默时段直接丢弃', async () => {
  const { bridge, calls } = makeBridge({
    quietRanges: [{ start: 0, end: 24 * 60 }],
    config: { ...makeBridge().bridge.config, quietHoursEnabled: true, quietHours: ['0-24'] },
  })
  await onQqMessageInner({ message: msg(), bridge, defineTool: () => {}, debugLog: () => {} })
  assert.equal(calls.help, 0)
  assert.equal(calls.snapshots, 1)
})

test('重复消息直接丢弃', async () => {
  const { bridge, calls } = makeBridge({ duplicate: () => true })
  await onQqMessageInner({ message: msg(), bridge, defineTool: () => {}, debugLog: () => {} })
  assert.equal(calls.help, 0)
  assert.equal(calls.snapshots, 1)
})
