// 生图价格表（人民币/张，估；以官方账单为准）。
const PRICE = {
  'cogview-3-flash': 0,
  'cogview-4': 0.1,
  'cogview-4-250304': 0.1,
  'wanx2.1-t2i-turbo': 0.15,
  'wanx2.1-t2i-plus': 0.2,
  'qwen-image-3.0': 0.18,
  'qwen-image-2.0-pro': 0.2,
  'flux': 0,
  'flux-schnell': 0,
  'local': 0,
}

/** 按模型估算单张成本（元）；未知模型返回 null。 */
export function estimateCost(model, cfg = {}) {
  if (Number.isFinite(Number(cfg.cost))) return Number(cfg.cost)
  const key = String(model || '').toLowerCase()
  if (key in PRICE) return PRICE[key]
  for (const name of Object.keys(PRICE)) {
    if (key.includes(name)) return PRICE[name]
  }
  return null
}
