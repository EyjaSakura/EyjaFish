import test from 'node:test'
import assert from 'node:assert/strict'
import { onQqMessageInner } from '../lib/message-pipeline.js'

function makeBridge() {
  const handed = []
  const memories = []
  const base = {
    config: {
      allowUsers: [1], allowGroups: [], pointsEnabled: false, statsEnabled: false,
      dedupWindowSeconds: 0, verifyEnabled: false, antiRecallEnabled: false,
      filterEnabled: false, floodEnabled: false, autoCollectStickers: false,
      timeAwarenessEnabled: false, sttEnabled: false, keywordEnabled: false,
      gameEnabled: false, checkinEnabled: false, welcomeEnabled: false,
      imageGenEnabled: false, acceptPrivate: true, replyOnlyWhenMentioned: false, ownerQq: '1', adminUsers: ['1'],
    },
    quietRanges: [],
    archive: null,
    sessions: new Map(),
    agents: new Map(),
    beginTrace: () => ({ mark: () => {} }),
    beginEventTrace: () => ({ mark: () => {} }),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    async ensureSession() {
      return { sessionId: 'sess-abcdef', resumed: false, handle: { agent: { status: 'idle' } }, lastTraceId: '', lastTurnAt: 0 }
    },
    recordMemory: (key, role, text) => memories.push({ key, role, text }),
    routeKey: () => 'u:1',
    chatKeyOf: () => 'u:1',
    routeOf: () => ({ messageType: 'private', targetId: 1 }),
    handoff: (entry, message, payload) => handed.push(payload),
    countTurn: () => {},
    writeRuntimeSnapshot: () => {},
    safeReply: async () => {},
    pushRecentMsg: () => {},
    recentBlock: () => '',
    sharedMemoryBlock: () => '',
    selfStateBlock: () => '',
    engageOn: () => false,
    typingStart: async () => ({ ok: false, reason: '' }),
    duplicate: () => false,
    allowed: () => true,
    markSeen: () => {},
    rememberText: () => {},
    countOps: () => {},
    engagePassive: async () => {},
    textMentionName: async () => '',
    stripSelfMention: (_m, t) => t,
    handleIncomingVideo: async () => {},
    collectSticker: () => {},
    handleJoinAnswer: async () => false,
    handleContentFilter: async () => false,
    safeReply: async () => {},
  }
  const bridge = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => false
    },
  })
  return { bridge, handed, memories }
}

const message = () => ({
  messageType: 'private', userId: 1, messageId: 'm1', text: '在吗',
  senderName: 'tester', atMe: false, images: [], records: [], files: [], forwards: [],
  raw: { message: [] },
})

test('消息 → 会话 → handoff（mock agent 边界）', async () => {
  const { bridge, handed, memories } = makeBridge()
  await onQqMessageInner({ message: message(), bridge, defineTool: (d) => d, debugLog: () => {} })
  assert.equal(handed.length, 1)
  assert.equal(handed[0].content[0].type, 'text')
  assert.match(handed[0].content[0].text, /在吗/)
  assert.equal(handed[0].source.kind, 'user')
  assert.equal(memories.length, 1)
  assert.equal(memories[0].role, 'user')
})
