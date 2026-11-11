// 桥接模块共用的纯函数（从 bridge.js 顶层 helper 复制）
// 之后 bridge.js 也可以改为从这里 import，避免两份实现。

export function assistantText(event) {
  return event.data.message.content
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text)
    .join('')
}

export function splitSegments(segments, limit) {
  const batches = []
  let current = []
  let length = 0
  for (const segment of segments) {
    const textLen = segment.type === 'text' ? String(segment.data?.text ?? '').length : 1
    if (length > 0 && length + textLen > limit) {
      batches.push(current)
      current = []
      length = 0
    }
    current.push(segment)
    length += textLen
  }
  if (current.length > 0) batches.push(current)
  return batches
}


export function isQuietTime(config, ranges, now = new Date()) {  if (!config.quietHoursEnabled || ranges.length === 0) return false
  const day = now.getDay()
  if (config.quietWeekendExempt && (day === 0 || day === 6)) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return ranges.some((range) => range.start < range.end
    ? minutes >= range.start && minutes < range.end
    : minutes >= range.start || minutes < range.end)  // overnight window
}
