import test from 'node:test'
import assert from 'node:assert/strict'
import { featureFlags } from '../lib/services/feature-flags.js'

test('开关透传 + 计数', () => {
  const flags = featureFlags(
    { imageGenEnabled: true, sttEnabled: false, allowUsers: ['1', '2'], allowGroups: ['9'] },
    { reactions: 3, typing: 2, opsDays: 5, pendingKick: 1 },
  )
  assert.equal(flags.imageGenEnabled, true)
  assert.equal(flags.sttEnabled, false)
  assert.equal(flags.allowUsers, 2)
  assert.equal(flags.allowGroups, 1)
  assert.equal(flags.reactionMessageCount, 3)
  assert.equal(flags.typingActiveCount, 2)
  assert.equal(flags.opsCounterEntries, 5)
  assert.equal(flags.pendingKickBatches, 1)
})

test('密钥只暴露是否配置，不暴露内容', () => {
  const flags = featureFlags({
    verifyKeyword: 'secret',
    autoHealCommand: 'run me',
    webhookSources: [{ token: 'abc' }],
    broadcastJobs: [{ id: 1 }, { id: 2 }],
  })
  assert.equal(flags.verifyKeywordConfigured, true)
  assert.equal(flags.autoHealCommandConfigured, true)
  assert.equal(flags.webhookSourceCount, 1)
  assert.equal(flags.broadcastJobCount, 2)
  assert.equal(JSON.stringify(flags).includes('secret'), false)
  assert.equal(JSON.stringify(flags).includes('run me'), false)
  assert.equal(JSON.stringify(flags).includes('abc'), false)
})

test('空配置不抛错', () => {
  const flags = featureFlags()
  assert.equal(flags.imageGenEnabled, undefined)
  assert.equal(flags.allowUsers, 0)
})
