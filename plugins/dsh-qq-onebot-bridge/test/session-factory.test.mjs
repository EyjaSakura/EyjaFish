import test from 'node:test'
import assert from 'node:assert/strict'
import { createSession, resumeSession } from '../lib/core/session-factory.js'

function makeHost(overrides = {}) {
  const calls = []
  const role = overrides.role || { id: 'owner', guest: false, cwd: 'D:/owner' }
  const surface = { inheritedTools: ['read', 'write'], needRestrict: true }
  const handle = { agent: { id: 'sess-1' } }
  const entry = { sessionId: 'sess-1' }

  const host = {
    routeOf: () => ({ messageType: 'private', targetId: 1 }),
    modelSelection: () => ({ model: 'm' }),
    roleOf: () => role,
    ensureRoleCwd: () => calls.push('ensureRoleCwd'),
    toolSurface: () => surface,
    presetForSurface: () => 'preset-x',
    createAgent: async (args) => { calls.push(['createAgent', args]); await args.setup({}); return handle },
    resumeAgent: async (args) => { calls.push(['resumeAgent', args]); await args.setup({}); return handle },
    mountPreset: (c, p, l) => calls.push(['mount', p, l]),
    installSession: (c, r, k, o) => calls.push(['install', o.resumed]),
    applyRolePermission: () => calls.push('applyRole'),
    registerSession: () => { calls.push('register'); return entry },
    bindSession: (k, id) => calls.push(['bind', id]),
    recordAclSession: (e, s, st) => calls.push(['record', st]),
    freshSessionId: (p) => p + '-1',
    sessionPrefix: (k) => 'qq-' + k,
    brandSessionId: (id) => 'brand-' + id,
    explainToolSurface: () => 'surface',
    createSession: async () => { calls.push(['fallbackCreate']); return { sessionId: 'fresh' } },
    logger: { info: () => calls.push('log') },
    debugLog: () => {},
    ...overrides,
  }
  return { host, calls, handle }
}

test('createSession：顺序与 meta', async () => {
  const { host, calls } = makeHost()
  const entry = await createSession({ message: {}, key: 'u:1', host })
  assert.equal(entry.sessionId, 'sess-1')
  const names = calls.map((c) => Array.isArray(c) ? c[0] : c)
  assert.deepEqual(names.filter((n) => ['mount', 'install', 'applyRole', 'register', 'bind', 'record'].includes(n)),
    ['mount', 'install', 'applyRole', 'register', 'bind', 'record'])
  const create = calls.find((c) => Array.isArray(c) && c[0] === 'createAgent')[1]
  assert.equal(create.sessionId, 'qq-u:1-1')
  assert.equal(create.meta.agentPreset, 'preset-x')
  assert.equal(create.meta.cwd, 'D:/owner')
})

test('createSession：parentSession 透传', async () => {
  const { host, calls } = makeHost()
  await createSession({ message: {}, key: 'u:1', opts: { parentSession: 'old' }, host })
  const create = calls.find((c) => Array.isArray(c) && c[0] === 'createAgent')[1]
  assert.equal(create.meta.parentSession, 'old')
})

test('resumeSession：guest 拒绝续接，转为新建', async () => {
  const { host, calls } = makeHost({ role: { id: 'guest', guest: true, cwd: 'D:/g' } })
  const entry = await resumeSession({ message: {}, key: 'u:1', sessionId: 'old', host })
  assert.equal(entry.sessionId, 'fresh')
  assert.ok(calls.some((c) => Array.isArray(c) && c[0] === 'fallbackCreate'))
  assert.equal(calls.some((c) => Array.isArray(c) && c[0] === 'resumeAgent'), false)
})

test('resumeSession：正常续接带 brand id', async () => {
  const { host, calls } = makeHost()
  await resumeSession({ message: {}, key: 'u:1', sessionId: 'old', host })
  const resume = calls.find((c) => Array.isArray(c) && c[0] === 'resumeAgent')[1]
  assert.equal(resume.resumeSessionId, 'brand-old')
  const install = calls.find((c) => Array.isArray(c) && c[0] === 'install')
  assert.equal(install[1], true)
  assert.ok(calls.some((c) => Array.isArray(c) && c[0] === 'record' && c[1] === 'resumed'))
})
