// 记忆提示词块：v2 事实层与旧 shared-memory 两条路径。
// 纯函数 + 注入 fs，便于单测。

export function buildMemoryBlockV2({ dir, count, env = process.env, exists, readFile, writeFile, appendFile, now = Date.now }) {
  const flag = joinPath(dir, 'USE_V2')
  if (!exists(flag)) return ''
  const factsFile = joinPath(dir, 'facts.json')
  const digestFile = joinPath(dir, 'index', 'digest.json')
  let facts = []
  try {
    const j = JSON.parse(readFile(factsFile, 'utf8').replace(/^\uFEFF/, ''))
    facts = Array.isArray(j && j.facts) ? j.facts : []
  } catch { return '' }
  let digest = {}
  try { digest = JSON.parse(readFile(digestFile, 'utf8').replace(/^\uFEFF/, '')) } catch { digest = {} }

  const active = facts
    .filter((f) => f && f.status === 'active' && f.claim)
    .sort((a, b) => {
      const pa = String(a.subject || '').startsWith('person.') ? 0 : 1
      const pb = String(b.subject || '').startsWith('person.') ? 0 : 1
      if (pa !== pb) return pa - pb
      return (Number(b.recorded_at) || 0) - (Number(a.recorded_at) || 0)
    })
    .slice(0, 12)
  if (!active.length) return ''

  const project = env.QQ_MEMORY_PROJECT || ''
  const lines = []
  let used = 0
  if (project && digest[project] && digest[project].summary) {
    const head = '【' + project + '】' + digest[project].summary
    lines.push(head); used += head.length
  }
  const usedIds = []
  for (const f of active) {
    const flag2 = Number(f.confidence) < 0.5 ? '（不确定）' : ''
    const line = '- ' + String(f.claim) + flag2
    if (used + line.length > 700) break
    lines.push(line); used += line.length
    usedIds.push(f.id)
  }
  if (!lines.length) return ''

  try {
    appendFile('D:\\DSH\\qqbot\\logs\\memory-v2-usage.log',
      new Date(now()).toISOString() + ' facts=' + usedIds.length + ' chars=' + used + '\n', 'utf8')
  } catch { /* usage log 失败不影响 */ }

  try {
    const logFile = env.QQ_RECALL_LOG || 'D:\\DSH\\qqbot\\data\\memory-recall.json'
    let log = []
    if (exists(logFile)) {
      try {
        const j = JSON.parse(readFile(logFile, 'utf8').replace(/^\uFEFF/, ''))
        log = Array.isArray(j && j.log) ? j.log : []
      } catch { /* ignore */ }
    }
    log.push({
      at: now(),
      chat: '',
      ids: usedIds,
      texts: active.filter((f) => usedIds.includes(f.id)).map((f) => String(f.claim).slice(0, 40)),
    })
    writeFile(logFile, JSON.stringify({ log: log.slice(-300) }, null, 2), 'utf8')
  } catch { /* recall log 失败不影响 */ }

  return '【共用记忆｜共 ' + count + ' 个窗口，是同一份，别复述，当成自己本来就知道的】\n' + lines.join('\n')
}

export function buildSharedMemoryBlock({ file, chatKey, count, env = process.env, exists, readFile, writeFile, now = Date.now, createHash }) {
  let data = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!exists(file)) return ''
      const raw = readFile(file, 'utf8').replace(/^\uFEFF/, '')
      data = JSON.parse(raw)
      break
    } catch (e) {
      if (attempt === 0) {
        try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100) } catch { /* ignore */ }
        continue
      }
      return ''
    }
  }
  if (!data) return ''
  const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const fid = (s) => 'm' + createHash('sha1').update(norm(s), 'utf8').digest('hex').slice(0, 12)
  const facts = Array.isArray(data && data.facts) ? data.facts : []
  const picked = []
  for (const x of facts) {
    if (!x || typeof x !== 'object') continue
    if (x.test === true) continue
    if (x.status === 'rejected') continue
    const t = String(x.text || '').trim()
    if (!t) continue
    picked.push({ text: (x.status === 'pending' ? '（待确认）' : '') + t, id: fid(t) })
    if (picked.length >= 40) break
  }
  if (!picked.length) return ''
  const head = '【共用记忆｜共 ' + count + ' 个窗口，是同一份，别复述，当成自己本来就知道的】'
  let out = head + '\n'
  let used = 0
  const usedFacts = []
  for (const p of picked) {
    if (used + p.text.length > 700) break
    out += '- ' + p.text + '\n'
    used += p.text.length
    usedFacts.push(p)
  }
  if (!usedFacts.length) return ''
  try {
    const logFile = env.QQ_RECALL_LOG || 'D:\\DSH\\qqbot\\data\\memory-recall.json'
    let log = []
    if (exists(logFile)) {
      try {
        const j = JSON.parse(readFile(logFile, 'utf8').replace(/^\uFEFF/, ''))
        log = Array.isArray(j && j.log) ? j.log : []
      } catch { /* ignore */ }
    }
    log.push({
      at: now(),
      chat: chatKey || '',
      ids: usedFacts.map((x) => x.id),
      texts: usedFacts.map((x) => x.text.slice(0, 40)),
    })
    writeFile(logFile, JSON.stringify({ log: log.slice(-300) }, null, 2), 'utf8')
  } catch { /* ignore */ }
  return out.trimEnd()
}

function joinPath(dir, ...names) {
  return [String(dir).replace(/[\\/]+$/, ''), ...names].join('\\')
}
