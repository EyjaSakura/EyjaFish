import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const bridgeFile = join(root, 'lib', 'bridge.js')
const facadeFile = join(root, 'lib', 'services', 'bridge-facade.js')
const bridgeSource = readFileSync(bridgeFile, 'utf8')
const facadeSource = readFileSync(facadeFile, 'utf8')
const methodNames = new Set(
  [...`${bridgeSource}\n${facadeSource}`.matchAll(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]),
)
const fieldNames = new Set()
for (const line of bridgeSource.split(/\r?\n/)) {
  if (!/^\s{2}[A-Za-z_$]/.test(line)) continue
  for (const match of line.matchAll(/([A-Za-z_$][\w$]*)\s*;/g)) fieldNames.add(match[1])
}

// 这些是运行时状态字段，不是方法；允许 feature 直接读写。
const STATE_FIELDS = new Set([
  'js', 'outbox', 'rateNoticeMap', 'stickerMsgMap', 'qzoneCookieCache', 'qzoneClientService',
  'archiveWarnedAt', 'douyinSentAt', 'injectConsumed', 'injectInterval', 'injectLastAt',
  'injectReplyTarget', 'lastQuotedAt', 'lastQuotedImages', 'lastQuotedStickerName',
  'lastQzonePollAt', 'lastSticker', 'lastStickerName', 'unknownSessionSeen',
  'workspaceBackfillPending', 'workspaceRegistryNoted', 'workspaceRegistryVia',
  'debugLog', 'serve',
])

function jsFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...jsFiles(path))
    else if (name.endsWith('.js')) out.push(path)
  }
  return out
}

test('feature / pipeline 调用的 bridge.* 都有公开方法或状态字段', () => {
  const files = [
    ...jsFiles(join('D:/DSH/plugins/features')),
    join(root, 'lib', 'message-pipeline.js'),
    join(root, 'lib', 'reply-router.js'),
  ]
  const missing = new Map()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bbridge\??\.([A-Za-z_$][\w$]*)/g)) {
      const name = match[1]
      if (methodNames.has(name) || fieldNames.has(name) || STATE_FIELDS.has(name)) continue
      if (!missing.has(name)) missing.set(name, [])
      missing.get(name).push(file.replace(root, '<bridge>'))
    }
  }
  assert.deepEqual([...missing.keys()].sort(), [], `缺少 bridge 成员：${[...missing].map(([n, f]) => `${n} (${f[0]})`).join(', ')}`)
})
