import test from 'node:test'
import assert from 'node:assert/strict'
import { formatBroadcastFeed } from '../lib/services/broadcast-feed.js'

const items = [
  { id: '1', title: 'Hello', summary: 'world', link: 'l1' },
  { id: '2', title: 'Other', summary: 'x', link: 'l2' },
]

function deps(overrides = {}) {
  return {
    xml: '<rss/>',
    job: {},
    parseFeed: () => ({ title: 'Feed', items }),
    formatFeedItems: (picked) => ({ text: 'T:' + picked.map((x) => x.id).join(',') }),
    ...overrides,
  }
}

test('没有条目', () => {
  const r = formatBroadcastFeed(deps({ parseFeed: () => ({ items: [], reason: 'bad xml' }) }))
  assert.equal(r.text, '')
  assert.equal(r.reason, 'bad xml')
})

test('关键词无匹配', () => {
  const r = formatBroadcastFeed(deps({ job: { keyword: 'nope' } }))
  assert.match(r.reason, /没有匹配/)
})

test('关键词过滤 + ids 回退', () => {
  const r = formatBroadcastFeed(deps({ job: { keyword: 'hello' } }))
  assert.equal(r.text, 'T:1')
  assert.deepEqual(r.ids, ['1'])

  const noId = formatBroadcastFeed(deps({
    parseFeed: () => ({ title: 'F', items: [{ title: 't', link: 'u' }] }),
  }))
  assert.deepEqual(noId.ids, ['u'])
})
