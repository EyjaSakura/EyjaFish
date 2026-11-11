import test from 'node:test'
import assert from 'node:assert/strict'
import { registerScopedWebTools, registerInlineWebTools } from '../lib/tools/web-tools.js'

test('web 不可用：warn 并返回', () => {
  const warns = []
  registerScopedWebTools({
    agentCtx: {}, key: 'u:1', resolveWeb: () => undefined,
    registerInlineWebTools, defineTool: (t) => t,
    logger: { warn: (m) => warns.push(m) }, debugLog: () => {},
  })
  assert.match(warns[0], /web 服务不可用/)
})

test('注册失败：warn 不抛', () => {
  const warns = []
  registerScopedWebTools({
    agentCtx: {}, key: 'u:1', resolveWeb: () => ({}),
    registerInlineWebTools: () => { throw new Error('boom') }, defineTool: (t) => t,
    logger: { warn: (m) => warns.push(m) }, debugLog: () => {},
  })
  assert.match(warns[0], /注册联网工具失败/)
})

test('web_search：合并来源、去重、参数校验', async () => {
  const tools = []
  const web = {
    search: async ({ query }) => ({
      content: query === 'a' ? '摘要' : '',
      sources: [{ url: 'https://x/1', title: '一' }, { url: 'https://x/' + query, title: query }],
      truncated: false,
    }),
  }
  registerInlineWebTools({ tools: { register: (t) => tools.push(t) } }, web, (t) => t)
  const search = tools.find((t) => t.name === 'web_search')
  const out = await search.execute({ queries: ['a', 'a', 'b'] })
  assert.equal(out.content, '摘要')
  assert.equal(out.sources.length, 3)
  await assert.rejects(() => search.execute({ queries: [] }), /at least one/)
  await assert.rejects(() => search.execute({ queries: ['1', '2', '3', '4', '5'] }), /at most 4/)
  assert.match(search.output.render({}, { content: '摘要', sources: [{ url: 'https://x', title: 't' }], truncated: false })[0].text, /摘要/)
})

test('web_fetch：成功与 provider 缺失', async () => {
  const tools = []
  registerInlineWebTools({ tools: { register: (t) => tools.push(t) } }, { fetch: async ({ url }) => ({ url, statusCode: 200, body: { kind: 'html', content: 'hi' }, truncated: false }) }, (t) => t)
  const fetch = tools.find((t) => t.name === 'web_fetch')
  const out = await fetch.execute({ url: 'https://x' })
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.kind, 'html')
  assert.match(fetch.output.render({}, { url: 'https://x', statusCode: 200, body: { kind: 'text', content: 'hi' }, truncated: false })[0].text, /hi/)

  const empty = []
  registerInlineWebTools({ tools: { register: (t) => empty.push(t) } }, {}, (t) => t)
  await assert.rejects(() => empty.find((t) => t.name === 'web_fetch').execute({ url: 'https://x' }), /unavailable/)
})
