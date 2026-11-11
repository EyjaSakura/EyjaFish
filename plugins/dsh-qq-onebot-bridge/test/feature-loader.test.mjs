import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadFeatures } from '../lib/feature-loader.js'

function feature(dir, name, hook) {
  const d = join(dir, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: '@test/' + name, type: 'module', dshFeature: { hooks: [hook] } }))
  writeFileSync(join(d, 'index.js'), `export const hooks = { ${hook}: () => {} }\n`)
}

test('加载插件并写 status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-feat-'))
  feature(dir, 'a', 'registerA')
  feature(dir, 'b', 'registerB')
  const logs = []
  const map = await loadFeatures(dir, (m) => logs.push(m))
  assert.equal(typeof map.get('registerA'), 'function')
  assert.equal(typeof map.get('registerB'), 'function')
  assert.ok(logs.some((l) => l.includes('loaded a')))
})

test('禁用插件不加载', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-feat-'))
  feature(dir, 'a', 'registerA')
  feature(dir, 'b', 'registerB')
  writeFileSync(join(dir, 'disabled.json'), JSON.stringify(['b']))
  const map = await loadFeatures(dir, () => {})
  assert.equal(typeof map.get('registerA'), 'function')
  assert.equal(map.get('registerB'), undefined)
})

test('重复 hook 会被记录', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-feat-'))
  feature(dir, 'a', 'registerSame')
  feature(dir, 'b', 'registerSame')
  const map = await loadFeatures(dir, () => {})
  assert.equal(typeof map.get('registerSame'), 'function')
  assert.equal(map.modules.size, 2)
  // status.json 里应有 duplicates（若 loader 写入）
  const status = JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8'))
  assert.ok(status.duplicates.length >= 1)
})


test('registerFeature 插件保留在 modules 里', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-feat-'))
  feature(dir, 'generic', 'registerFeature')
  const map = await loadFeatures(dir, () => {})
  const mod = map.modules.get('generic')
  assert.equal(typeof mod.hooks.registerFeature, 'function')
})


test('加载失败的插件只记日志，不影响其它', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-feat-'))
  feature(dir, 'ok', 'registerOk')
  const bad = join(dir, 'bad')
  mkdirSync(bad, { recursive: true })
  writeFileSync(join(bad, 'package.json'), JSON.stringify({ name: '@test/bad', type: 'module', dshFeature: { hooks: ['x'] } }))
  writeFileSync(join(bad, 'index.js'), 'throw new Error("boom")\n')
  const logs = []
  const map = await loadFeatures(dir, (m) => logs.push(m))
  assert.equal(typeof map.get('registerOk'), 'function')
  assert.ok(logs.some((l) => l.includes('load failed')))
})


test('缺 package.json 的插件也能加载', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-feat-'))
  const d = join(dir, 'nopkg')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'index.js'), 'export const hooks = { registerNoPkg: () => {} }\n')
  const map = await loadFeatures(dir, () => {})
  assert.equal(typeof map.get('registerNoPkg'), 'function')
})
