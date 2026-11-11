import test from 'node:test'
import assert from 'node:assert/strict'

import { bridgeFacadeMethods as facade } from '../lib/services/bridge-facade.js'

function makeContext() {
  const calls = []
  const record = (name) => (...args) => { calls.push([name, ...args]); return name }
  return {
    calls,
    config: { opsReportEnabled: true, groupOpsEnabled: true },
    proactiveRuntime: {
      maybeStartupGreet: record('maybeStartupGreet'),
      maybeDouyinBrowse: record('maybeDouyinBrowse'),
      resetStuckTurns: record('resetStuckTurns'),
      setActivity: record('setActivity'),
      maybeChooseActivity: record('maybeChooseActivity'),
      pollAnalyzeResults: record('pollAnalyzeResults'),
      maybeDouyinSpark: record('maybeDouyinSpark'),
      pollDouyinInbox: record('pollDouyinInbox'),
    },
    queueRuntime: {
      clearStaleQueues: record('clearStaleQueues'),
      queueUserMessage: record('queueUserMessage'),
      flushDeferred: record('flushDeferred'),
      flushAllDeferred: record('flushAllDeferred'),
      loadOutbox: record('loadOutbox'),
      enqueueOutbox: record('enqueueOutbox'),
      flushOutbox: record('flushOutbox'),
    },
    recentRuntime: {
      linkLastSticker: record('linkLastSticker'),
      pushRecentMsg: record('pushRecentMsg'),
      recentBlock: record('recentBlock'),
      rememberText: record('rememberText'),
    },
    messagingRuntime: {
      notify: record('notify'),
      replyTo: record('replyTo'),
      shouldForward: record('shouldForward'),
      sendForwardCard: record('sendForwardCard'),
      sendBusyNotice: record('sendBusyNotice'),
    },
    injectionRuntime: {
      injectionSuppressed: record('injectionSuppressed'),
      markSuppressed: record('markSuppressed'),
    },
    engagementRuntime: { saveEngage: record('saveEngage') },
    sendRootsRuntime: {
      sendRoots: record('sendRoots'),
      resolveSendPath: record('resolveSendPath'),
    },
    mediaSendRuntime: {
      sendImageBuffer: record('sendImageBuffer'),
      sendImageTo: record('sendImageTo'),
      sendFileTo: record('sendFileTo'),
      ttsUsable: record('ttsUsable'),
      sendVoiceTo: record('sendVoiceTo'),
    },
    sentHistoryRuntime: {
      trackSent: record('trackSent'),
      recallRecent: record('recallRecent'),
    },
    contactPolicyRuntime: {
      notifyOwner: record('notifyOwner'),
      contacts: record('contacts'),
      ownerQQ: record('ownerQQ'),
      drawAllowed: record('drawAllowed'),
      selfKindEnabled: record('selfKindEnabled'),
    },
    rateLimiter: { limited: (key) => key === 'slow' },
    duplicateGuard: { isDuplicate: (message) => message === 'dup' },
    server: { sendSegments: record('sendSegments') },
  }
}

test('bridge façade：proactive / queue / recent / messaging', async () => {
  const ctx = makeContext()
  assert.equal(facade.maybeStartupGreet.call(ctx), 'maybeStartupGreet')
  assert.equal(facade.maybeDouyinBrowse.call(ctx), 'maybeDouyinBrowse')
  assert.equal(facade.resetStuckTurns.call(ctx), 'resetStuckTurns')
  assert.equal(facade.setActivity.call(ctx, 'x'), 'setActivity')
  assert.equal(facade.maybeChooseActivity.call(ctx), 'maybeChooseActivity')
  await facade.pollAnalyzeResults.call(ctx)
  assert.equal(facade.maybeDouyinSpark.call(ctx), 'maybeDouyinSpark')
  await facade.pollDouyinInbox.call(ctx)
  assert.equal(facade.clearStaleQueues.call(ctx), 'clearStaleQueues')
  assert.equal(facade.queueUserMessage.call(ctx, 'k', 'm'), 'queueUserMessage')
  await facade.flushDeferred.call(ctx, 'k')
  assert.equal(facade.flushAllDeferred.call(ctx), 'flushAllDeferred')
  assert.equal(facade.loadOutbox.call(ctx), 'loadOutbox')
  assert.equal(facade.enqueueOutbox.call(ctx, 'k', {}, 't'), 'enqueueOutbox')
  await facade.flushOutbox.call(ctx)
  assert.equal(facade.linkLastSticker.call(ctx, 'k', 's'), 'linkLastSticker')
  assert.equal(facade.pushRecentMsg.call(ctx, 'k', 'm', 'u', 't'), 'pushRecentMsg')
  assert.equal(facade.recentBlock.call(ctx, 'k'), 'recentBlock')
  assert.equal(facade.rememberText.call(ctx, 'm', 't'), 'rememberText')
  assert.equal(facade.notify.call(ctx, 't'), 'notify')
  assert.equal(facade.injectionSuppressed.call(ctx, 'k'), 'injectionSuppressed')
  assert.equal(facade.markSuppressed.call(ctx, 'k', 'w', 't'), 'markSuppressed')
  await facade.replyTo.call(ctx, {}, 't', {})
  assert.equal(facade.shouldForward.call(ctx, 't', {}, false), 'shouldForward')
  await facade.sendForwardCard.call(ctx, {}, 't')
  await facade.sendBusyNotice.call(ctx, {})
})

test('bridge façade：发送 / 路由 / 策略 / 纯函数', async () => {
  const ctx = makeContext()
  assert.equal(facade.rateLimited.call(ctx, 'slow'), true)
  assert.equal(facade.rateLimited.call(ctx, 'fast'), false)
  assert.equal(facade.duplicate.call(ctx, 'dup'), true)
  assert.equal(facade.saveEngageState.call(ctx), 'saveEngage')
  assert.equal(facade.sendRoots.call(ctx, 'owner'), 'sendRoots')
  assert.equal(facade.resolveSendPath.call(ctx, 'x', 'owner'), 'resolveSendPath')
  await facade.sendImageBuffer.call(ctx, {}, Buffer.from('x'), 'c')
  await facade.sendImageTo.call(ctx, {}, 'f', 'c')
  await facade.sendFileTo.call(ctx, {}, 'f', 'n')
  assert.equal(facade.ttsUsable.call(ctx), 'ttsUsable')
  await facade.sendVoiceTo.call(ctx, {}, 't')
  assert.equal(facade.trackSent.call(ctx, 'k', {}), 'trackSent')
  await facade.recallRecent.call(ctx, 'k', 1)
  assert.equal(facade.dryRunAck.call(ctx, { dryRun: true }), true)
  assert.equal(facade.dryRunAck.call(ctx, {}), false)
  facade.sendVoice.call(ctx, { bot: 'b', messageType: 'group', targetId: 1 }, [])
  facade.sendRecord.call(ctx, { bot: 'b', messageType: 'group', targetId: 1 }, 'f')
  await facade.notifyOwner.call(ctx, {}, 't')
  assert.equal(facade.contacts.call(ctx), 'contacts')
  assert.equal(facade.ownerQQ.call(ctx), 'ownerQQ')
  assert.equal(facade.drawAllowed.call(ctx, 's'), 'drawAllowed')
  assert.equal(facade.selfKindEnabled.call(ctx, 'kind'), 'selfKindEnabled')
  assert.equal(typeof facade.routeKey.call(ctx, {}), 'string')
  assert.equal(facade.routeOf.call(ctx, { messageType: 'private', userId: 1 }).messageType, 'private')
  assert.equal(typeof facade.chatKeyOf.call(ctx, { messageType: 'private', targetId: 1 }), 'string')
})
