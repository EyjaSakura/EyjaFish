// Lightweight quality gate for memory descriptions. Kept separate from the
// extractor so the daily cleanup CLI can use the same definition.
const TRIVIAL = /^(?:好[嘞哒滴]?|嗯+|哦+|啊+|哈+|收到|知道了|明白了|了解|ok|行+|可以+|对+|是+|原来如此|原来是这样|这样啊|真的吗|笑死|绷不住|用户表示理解|用户表示明白|用户表示知道了|用户表示收到|用户表示同意|用户表示认可)[。！!？?~～\s]*$/iu

export function isTrivialMemory(text) {
  const value = String(text ?? '').trim()
  if (value === '') return true
  if (TRIVIAL.test(value)) return true
  // LLM sometimes emits "用户表示理解了……" as an event; that is a dialogue
  // receipt, not a durable fact.
  if (/^(?:用户|对方|助手|assistant)(?:表示|说)?(?:理解|明白|知道|收到|同意|认可)/iu.test(value) && value.length < 24) return true
  return false
}
