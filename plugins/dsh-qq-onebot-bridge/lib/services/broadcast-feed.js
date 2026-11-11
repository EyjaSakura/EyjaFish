// RSS/Atom 播报：解析 + 关键词过滤 + 排版。
export function formatBroadcastFeed({ xml, job, parseFeed, formatFeedItems }) {
  const limit = Math.max(1, Number(job?.maxItems) || 5)
  const parsed = parseFeed(xml, { limit })
  if (parsed.items.length === 0) return { text: '', ids: [], reason: parsed.reason || '没有解析出条目' }
  const keyword = String(job?.keyword ?? '').trim().toLowerCase()
  const picked = keyword === ''
    ? parsed.items
    : parsed.items.filter((item) => `${item.title ?? ''} ${item.summary ?? ''}`.toLowerCase().includes(keyword))
  if (picked.length === 0) return { text: '', ids: [], reason: `没有匹配「${keyword}」的条目` }
  const formatted = formatFeedItems(picked, { limit, title: parsed.title })
  return { text: formatted.text, ids: picked.map((item) => item.id || item.link || item.title), reason: '' }
}
