// Dispatch a feature hook by name, with a consistent missing-feature log.
import { debugLog } from '../core/debug-log.js'

export function dispatchFeature(features, name, ctx) {
  const feature = features?.get?.(name)
  if (!feature) { debugLog(`[feature] ${name} 未加载，功能已停用`); return }
  return feature(ctx)
}
