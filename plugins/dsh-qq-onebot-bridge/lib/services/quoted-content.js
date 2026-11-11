// 引用消息的段解析：把 OneBot message 段拆成文本/图片/语音。
// 纯函数，下载与 STT 仍由调用方处理。

export function extractQuoteParts(segments) {
  const texts = []
  const images = []
  const records = []
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment || typeof segment !== 'object') continue
    if (segment.type === 'text') {
      const t = String(segment.data?.text ?? '').trim()
      if (t) texts.push(t)
    } else if (segment.type === 'image') {
      const url = String(segment.data?.url || segment.data?.file || '')
      if (url && !url.startsWith('file://')) images.push(url)
    } else if (segment.type === 'record') {
      records.push({
        file: segment.data?.file ?? '',
        url: segment.data?.url ?? '',
        path: segment.data?.path ?? '',
      })
    } else if (segment.type === 'face') {
      texts.push(`[黄脸表情${segment.data?.id ?? ''}]`)
    } else if (segment.type === 'at') {
      texts.push(`@${segment.data?.qq ?? ''}`)
    }
  }
  return { texts, images, records }
}
