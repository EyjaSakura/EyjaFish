import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createQzoneClient } from '../lib/services/qzone-client.js'

function tempMemory() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-qzone-'))
  return join(dir, 'memory')
}

test('live 取 cookie 并拉列表', async () => {
  const memoryDir = tempMemory()
  const calls = []
  const client = createQzoneClient({
    getSocket: () => 'sock',
    action: async () => ({ cookies: 'uin=o12345; skey=1', bkn: 'bkn1' }),
    request: async (url, init) => {
      calls.push({ url, cookie: init.headers.cookie })
      return { code: 0, msglist: [{ tid: 1 }] }
    },
    memoryDir,
    debugLog: () => {},
  })
  const auth = await client.auth()
  assert.equal(auth.uin, '12345')
  assert.equal(auth.bkn, 'bkn1')
  const { list, uin } = await client.fetchList(5)
  assert.equal(uin, '12345')
  assert.deepEqual(list, [{ tid: 1 }])
  assert.match(calls[0].url, /uin=12345/)
  assert.match(calls[0].cookie, /uin=/)
})

test('无 socket 时读文件缓存', async () => {
  const memoryDir = tempMemory()
  writeFileSync(join(memoryDir, '..', 'qq-qzone-cookies.json'), JSON.stringify({ cookies: 'uin=o7; a=1', bkn: 'b', uin: '7', at: Date.now() }))
  const client = createQzoneClient({ getSocket: () => null, action: async () => ({}), request: async () => ({}), memoryDir })
  const auth = await client.auth()
  assert.equal(auth.uin, '7')
})

test('缓存过期抛错', async () => {
  const memoryDir = tempMemory()
  writeFileSync(join(memoryDir, '..', 'qq-qzone-cookies.json'), JSON.stringify({ cookies: 'x', bkn: 'b', uin: '7', at: 0 }))
  const client = createQzoneClient({ getSocket: () => null, action: async () => ({}), request: async () => ({}), memoryDir, now: () => 10 * 60 * 60 * 1000 })
  await assert.rejects(() => client.auth(), /没有可用的 qzone cookie/)
})

test('列表 JSONP 字符串能解析', async () => {
  const memoryDir = tempMemory()
  const client = createQzoneClient({
    getSocket: () => 's',
    action: async () => ({ cookies: 'uin=o1', bkn: 'b' }),
    request: async () => '_cb({"code":0,"msglist":[]});',
    memoryDir,
  })
  const r = await client.fetchList(3)
  assert.deepEqual(r.list, [])
})

test('列表 code 非 0 抛错', async () => {
  const memoryDir = tempMemory()
  const client = createQzoneClient({
    getSocket: () => 's',
    action: async () => ({ cookies: 'uin=o1', bkn: 'b' }),
    request: async () => ({ code: 100, message: '繁忙' }),
    memoryDir,
  })
  await assert.rejects(() => client.fetchList(3), /空间列表失败/)
})


test('live 取 cookie 失败：走文件缓存或抛错', async () => {
  const memoryDir = tempMemory()
  const logs = []
  const client = createQzoneClient({
    getSocket: () => 'sock',
    action: async () => { throw new Error('napcat down') },
    request: async () => ({}),
    memoryDir,
    debugLog: (m) => logs.push(m),
  })
  await assert.rejects(() => client.auth(), /没有可用的 qzone cookie/)
  assert.ok(logs.some((m) => m.includes('live auth failed')))
})

test('live 返回不完整 cookie：不采用，继续回退', async () => {
  const memoryDir = tempMemory()
  const client = createQzoneClient({
    getSocket: () => 'sock',
    action: async () => ({ cookies: 'uin=o1' }),
    request: async () => ({}),
    memoryDir,
  })
  await assert.rejects(() => client.auth(), /没有可用的 qzone cookie/)
})

test('列表空字符串报错', async () => {
  const memoryDir = tempMemory()
  const client = createQzoneClient({
    getSocket: () => 's',
    action: async () => ({ cookies: 'uin=o1', bkn: 'b' }),
    request: async () => '   ',
    memoryDir,
  })
  await assert.rejects(() => client.fetchList(3), /空间列表返回为空/)
})

test('request 抛错向上传播', async () => {
  const memoryDir = tempMemory()
  const client = createQzoneClient({
    getSocket: () => 's',
    action: async () => ({ cookies: 'uin=o1', bkn: 'b' }),
    request: async () => { throw new Error('network') },
    memoryDir,
  })
  await assert.rejects(() => client.fetchList(3), /network/)
})
