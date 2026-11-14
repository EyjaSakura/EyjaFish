// Chinese/English tokens with a character-level fallback for single-character
// recall. Intl.Segmenter('zh') returns ["今天","好累"] for "今天好累", so word
// tokens alone cannot match "累"; we add Han characters as their own tokens.
const segmenter = (() => {
  try {
    return new Intl.Segmenter('zh', { granularity: 'word' })
  } catch {
    return null
  }
})()

export function buildWordTokens(input) {
  const text = String(input ?? '').trim()
  if (text === '') return []
  const words = []
  if (segmenter) {
    try {
      for (const part of segmenter.segment(text)) {
        const word = String(part?.segment ?? '').trim()
        if (word !== '' && /[\p{L}\p{N}]/u.test(word)) words.push(word)
      }
    } catch { /* fall through */ }
  }
  return [...new Set(words)]
}

export function buildCharTokens(input) {
  return [...new Set([...String(input ?? '')].filter((ch) => /\p{Script=Han}/u.test(ch)))]
}

export function buildTokens(input) {
  return [...new Set([...buildWordTokens(input), ...buildCharTokens(input)])].join(' ')
}

export function hasIcu() {
  return segmenter !== null
}
