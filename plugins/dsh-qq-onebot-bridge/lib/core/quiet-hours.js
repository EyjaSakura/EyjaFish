// 免打扰时间段解析与判断。
export function parseQuietRanges(ranges) {
  const parsed = []
  if (!Array.isArray(ranges)) return parsed
  const fullWidthDigits = '０１２３４５６７８９'
  for (const item of ranges) {
    const normalized = String(item)
      .replace(/[：]/g, ':')
      .replace(/[－–—−]/g, '-')
      .replace(/[０-９]/g, (ch) => String(fullWidthDigits.indexOf(ch)))
    const match = normalized.match(/^\s*(\d{1,2}):(\d{1,2})\s*-\s*(\d{1,2}):(\d{1,2})\s*$/)
    if (!match) continue
    const h1 = Number(match[1]); const m1 = Number(match[2])
    const h2 = Number(match[3]); const m2 = Number(match[4])
    if (h1 > 23 || m1 > 59 || h2 > 23 || m2 > 59) continue
    const start = h1 * 60 + m1
    const end = h2 * 60 + m2
    if (start === end) continue
    parsed.push({ start, end })
  }
  return parsed
}

export function isQuietTime(config, ranges, now = new Date()) {
  if (!config.quietHoursEnabled || ranges.length === 0) return false
  const day = now.getDay()
  if (config.quietWeekendExempt && (day === 0 || day === 6)) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return ranges.some((range) => range.start < range.end
    ? minutes >= range.start && minutes < range.end
    : minutes >= range.start || minutes < range.end)
}
