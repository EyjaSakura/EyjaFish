// 功能插件加载器：扫描 D:\DSH\plugins\features\*，每个目录是一个独立功能插件
// 约定：index.js 导出 hooks = { registerXxx(...) }，bridge 对应位置优先调用插件实现。
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** @param {string} dir @param {(m: string) => void} [debugLog] */
export async function loadFeatures(dir, debugLog = () => {}) {
  const features = /** @type {Map<string, any> & { modules?: Map<string, any> }} */ (new Map())
  features.modules = new Map()
  const report = { at: new Date().toISOString(), features: [], duplicates: [] }
  const owners = new Map()
  if (!existsSync(dir)) return features
  let names = []
  try { names = readdirSync(dir) } catch (e) { debugLog('[feature] read dir failed: ' + e.message); return features }
  let disabled = []
  try {
    const file = join(dir, 'disabled.json')
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      disabled = Array.isArray(raw) ? raw.map(String) : []
    }
  } catch (e) { debugLog('[feature] read disabled.json failed: ' + e.message) }
  for (const name of names) {
    const base = join(dir, name)
    if (disabled.includes(name)) {
      let dataPaths = []
      try {
        const pkg = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'))
        dataPaths = Array.isArray(pkg?.dshFeature?.dataPaths) ? pkg.dshFeature.dataPaths.map(String) : []
      } catch { /* ignore */ }
      debugLog('[feature] disabled ' + name)
      report.features.push({ name, status: 'disabled', hooks: [], dataPaths })
      continue
    }
    const entry = join(base, 'index.js')
    try {
      if (!statSync(base).isDirectory() || !existsSync(entry)) continue
      const mod = await import(pathToFileURL(entry).href)
      features.modules.set(name, mod)
      const hooks = mod.hooks ?? {}
      let count = 0
      const hookNames = []
      for (const [hook, fn] of Object.entries(hooks)) {
        if (typeof fn !== 'function') continue
        if (owners.has(hook)) {
          const prev = owners.get(hook)
          report.duplicates.push({ hook, previous: prev, replacedBy: name })
          debugLog('[feature] duplicate hook ' + hook + ': ' + prev + ' -> ' + name)
        }
        owners.set(hook, name)
        features.set(hook, fn)
        hookNames.push(hook)
        count += 1
      }
      report.features.push({ name, status: 'loaded', hooks: hookNames })
      debugLog('[feature] loaded ' + name + ' (' + count + ' hooks)')
    } catch (e) {
      report.features.push({ name, status: 'failed', hooks: [], error: String(e.message) })
      debugLog('[feature] load failed ' + name + ': ' + e.message)
    }
  }
  try { writeFileSync(join(dir, 'status.json'), JSON.stringify(report, null, 2), 'utf8') } catch {}
  return features
}
