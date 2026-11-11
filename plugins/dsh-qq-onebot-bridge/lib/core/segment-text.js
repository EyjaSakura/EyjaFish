// 出站 segment 的一行摘要（注入 dry-run 报告用）。
export function summarizeSegments(segments) {
  if (!Array.isArray(segments)) return ''
  return segments
    .map((segment) => (segment?.type === 'text' ? String(segment.data?.text ?? '') : `[${segment?.type ?? '?'}]`))
    .join('')
    .slice(0, 200)
}
