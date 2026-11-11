// Cordis 服务读取：reflect 优先，ctx 属性兜底；永不抛。
export function resolveServiceMode({ ctx, name, activeOnly = false }) {
  if (ctx === undefined || ctx === null) return { service: undefined, via: 'no-ctx' }
  try {
    const active = ctx.reflect?.get?.(name, true)
    if (active !== undefined && active !== null) return { service: active, via: 'reflect.get(strict=true)' }
  } catch { /* 换下一种取法 */ }
  if (activeOnly !== true) {
    try {
      const any = ctx.reflect?.get?.(name, false)
      if (any !== undefined && any !== null) return { service: any, via: 'reflect.get(strict=false)' }
    } catch { /* 换下一种取法 */ }
  }
  try {
    const service = ctx[name]
    if (service !== undefined && service !== null) return { service, via: 'ctx[name]' }
  } catch { /* 换下一种取法 */ }
  return { service: undefined, via: 'none' }
}
