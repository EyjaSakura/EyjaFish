// Feature-backed notice/request handlers.
import { onRequest as handleRequestEvent } from '../request-events.js'
import { onQqMessage } from '../inbound-gate.js'
import { onQqMessageInner } from '../message-pipeline.js'
import { debugLog } from '../core/debug-log.js'

export function createInboundRuntime({ features, defineTool, bridge }) {
  function onNotice(notice) {
    const feature = features.get('onNotice')
    if (!feature) { debugLog('[feature] onNotice 未加载，功能已停用'); return }
    return feature({ notice, defineTool, debugLog, bridge })
  }

  function onRequest(request) {
    return handleRequestEvent({ request, debugLog, bridge })
  }

  function onQqMessageRuntime(message) {
    return onQqMessage({ message, defineTool, debugLog, bridge })
  }

  function onQqMessageInnerRuntime(message) {
    return onQqMessageInner({ message, defineTool, debugLog, bridge })
  }

  return { onNotice, onRequest, onQqMessage: onQqMessageRuntime, onQqMessageInner: onQqMessageInnerRuntime }
}
