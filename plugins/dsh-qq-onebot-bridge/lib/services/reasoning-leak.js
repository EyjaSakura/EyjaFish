// Drop obvious model self-talk/CoT paragraphs before QQ send / memory record.
// Conservative: only paragraphs that start with common reasoning markers and
// are mostly ASCII, or bracket-only English notes.
const META_START = /^(?:\[(?:Actually|Hmm|Careful|Let me|I should|I shouldn't|I'll|Fine|Wait|No need|End here)|(?:Actually|Hmm|Careful|Let me|I should|I shouldn't|I'll|Fine|Wait|No need|End here)\b)/i

function asciiRatio(text) {
  const chars = [...String(text)]
  if (chars.length === 0) return 0
  const ascii = chars.filter((c) => c.charCodeAt(0) < 128).length
  return ascii / chars.length
}

export function sanitizeAssistantText(input) {
  const text = String(input ?? '')
  if (text.trim() === '') return ''
  const paragraphs = text.split(/\n{2,}/)
  const kept = []
  for (const raw of paragraphs) {
    let paragraph = raw.trim()
    if (paragraph === '') continue
    if (META_START.test(paragraph)) {
      // Bracket notes are always internal, even if they quote a Chinese word.
      if (/^\[/.test(paragraph)) continue
      const chinese = paragraph.search(/[\u4e00-\u9fff]/)
      if (chinese < 0) continue
      paragraph = paragraph.slice(chinese).trim()
      // Something like "说说, sent 火花. Say that." is still a leaked
      // self-correction paragraph; only keep a genuinely Chinese tail.
      if (asciiRatio(paragraph) > 0.55) continue
    }
    if (/^\[[\s\S]*\]$/.test(paragraph) && asciiRatio(paragraph) > 0.5) continue
    if (paragraph !== '') kept.push(paragraph)
  }
  return kept.join('\n\n')
}
