import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCard, parseJsonCard, parseXmlCard, decodeCqPayload, normalizeLink, renderCard, cardDigest } from '../lib/qq-card.js'

test('JSON 卡片：meta 提取标题/摘要/链接/标签', () => {
  const card = parseJsonCard(JSON.stringify({
    app: 'x',
    meta: { news: { title: '标题', desc: '摘要', jumpUrl: 'https://a.com/p', tag: 'TAG', preview: 'p.png' } },
  }))
  assert.equal(card.parsed, true)
  assert.equal(card.title, '标题')
  assert.equal(card.desc, '摘要')
  assert.equal(card.url, 'https://a.com/p')
  assert.equal(card.tag, 'TAG')
})

test('JSON 卡片：非法 JSON 不抛错', () => {
  const card = parseJsonCard('not json')
  assert.equal(card.parsed, false)
  assert.equal(card.title, '')
})

test('XML 卡片：CDATA + 实体 + URL', () => {
  const card = parseXmlCard('<msg><item><title><![CDATA[你好 &amp; 世界]]></title><summary>摘要</summary><url>https://b.com/x</url></item></msg>')
  assert.equal(card.title, '你好 & 世界')
  assert.equal(card.desc, '摘要')
  assert.equal(card.url, 'https://b.com/x')
})

test('parseCard 按 kind 分派', () => {
  assert.equal(parseCard('<msg><item><title>T</title></item></msg>', 'xml').kind, 'xml')
  assert.equal(parseCard('{"meta":{"news":{"title":"T"}}}', 'json').kind, 'json')
})

test('decodeCqPayload 还原转义', () => {
  assert.equal(decodeCqPayload('a&#44;b&#91;c&#93;&amp;d'), 'a,b[c]&d')
})

test('normalizeLink 保留 http(s)', () => {
  assert.equal(normalizeLink('https://a.com/x'), 'https://a.com/x')
})

test('renderCard / cardDigest', () => {
  const card = parseJsonCard(JSON.stringify({ meta: { news: { title: '标题', desc: '摘要', jumpUrl: 'https://a.com/p' } } }))
  assert.match(renderCard(card), /\[卡片\] 标题/)
  const digest = JSON.parse(cardDigest(card, 100))
  assert.equal(digest.title, '标题')
  assert.equal(digest.url, 'https://a.com/p')
})
