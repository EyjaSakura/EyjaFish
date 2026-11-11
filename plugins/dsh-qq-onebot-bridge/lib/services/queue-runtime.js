// Outbox + deferred-injection queues. The bridge supplies its API object and
// message hook; queue mechanics stay here.
import { deferredFile, loadDeferred, queueUserMessage, flushDeferred, flushAllDeferred } from '../deferred.js'
import { loadOutbox, saveOutbox, enqueueOutbox, flushOutbox } from '../outbox.js'
import { clearStaleQueues as clearStaleQueuesService } from './stale-queues.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { debugLog } from '../core/debug-log.js'

export function createQueueRuntime({ bridgeApi, onQqMessage, rateLimited, setOutbox, offsetFile }) {
  const deferred = () => deferredFile(bridgeApi({ debugLog }))
  const loadDef = () => loadDeferred(bridgeApi({ debugLog }))

  function loadOut() {
    return loadOutbox(bridgeApi({ debugLog }))
  }

  function saveOut() {
    saveOutbox(bridgeApi({ debugLog }))
  }

  function flushAll() {
    flushAllDeferred(bridgeApi({ debugLog }))
  }

  async function flushOne(key) {
    await flushDeferred(bridgeApi({ onQqMessage: (...a) => onQqMessage(...a), debugLog }), key)
  }

  async function flushOut() {
    await flushOutbox(bridgeApi({ rateLimited: (...a) => rateLimited(...a), debugLog }))
  }

  function clearStale() {
    return clearStaleQueuesService({
      loadDeferred: loadDef,
      deferredFile: deferred,
      writeFile: writeFileSync,
      loadOutbox: loadOut,
      saveOutbox: saveOut,
      setOutbox,
      inbox: 'D:\\DSH\\qqbot\\douyin\\dm-inbox.jsonl',
      offsetFile,
      exists: existsSync,
      readFile: readFileSync,
      debugLog,
    })
  }

  return {
    deferredFile: deferred,
    loadDeferred: loadDef,
    queueUserMessage: (key, message) => queueUserMessage(bridgeApi({ debugLog }), key, message),
    flushDeferred: flushOne,
    flushAllDeferred: flushAll,
    loadOutbox: loadOut,
    saveOutbox: saveOut,
    enqueueOutbox: (key, route, text) => enqueueOutbox(bridgeApi({ debugLog }), key, route, text),
    flushOutbox: flushOut,
    clearStaleQueues: clearStale,
  }
}
