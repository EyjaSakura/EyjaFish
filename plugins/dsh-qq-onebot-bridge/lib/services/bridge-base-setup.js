// Base instance setup: identity, faces, memory, contact policy.
import { pathOf } from '../paths.js'
import { setDebugLogPath, debugLog } from '../core/debug-log.js'
import { FaceLibrary } from '../faces.js'
import { createMemoryRuntime } from './memory-runtime.js'
import { createIdentityRuntime } from './identity-runtime.js'
import { createContactPolicyRuntime } from './contact-policy-runtime.js'

export function createBridgeBase({ bridge, ctx, config, server, logger, features, defineTool }) {
  bridge.ctx = ctx
  bridge.config = config
  bridge.server = server
  bridge.logger = logger
  setDebugLogPath(pathOf(config, 'debugLog'))
  bridge.faces = new FaceLibrary(pathOf(config, 'faces'))
  bridge.quoteDir = pathOf(config, 'replies')
  bridge.imageDir = pathOf(config, 'images')
  bridge.memoryDir = pathOf(config, 'memory')
  bridge.memoryRuntime = createMemoryRuntime({ memoryDir: bridge.memoryDir, config, debugLog })
  bridge.identityRuntime = createIdentityRuntime({
    memoryDir: bridge.memoryDir,
    server: bridge.server,
    ownerQQ: () => bridge.ownerQQ(),
    recordMemory: (key, role, text) => bridge.recordMemory(key, role, text),
    features,
    defineTool,
  })
  bridge.contactPolicyRuntime = createContactPolicyRuntime({
    config,
    replyTo: (route, text, opts) => bridge.replyTo(route, text, opts),
  })
}
