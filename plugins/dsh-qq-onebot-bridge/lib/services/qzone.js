// QQ 空间 HTTP 请求：重试、JSONP 解析、空响应判定。
// 纯服务，fetch/sleep 可注入，方便单测。

export async function qzoneRequest(url, init = {}, tries = 3, options = {}) {
  const debugLog = options.debugLog || (() => {})
  const fetchImpl = options.fetchImpl || fetch
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))

  let last = null
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetchImpl(url, init)
      const text = await r.text()
      const t = String(text ?? '').trim()
      let j = null
      if (t !== '') {
        const jsonText = t.startsWith('{') ? t : t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'))
        try { j = JSON.parse(jsonText) } catch { j = null }
      }
      if (j && (j.code === 0 || j.code === undefined)) return j
      const msg = String((j && (j.message || j.msg || j.code)) || '')
      last = new Error(msg || (t === '' ? `空间接口返回为空（HTTP ${r.status}）` : '空间接口异常'))
      const busy = msg !== '' && /使用人数过多|繁忙|频率|稍后|busy|too many/i.test(msg)
      if ((busy || t === '') && i < tries - 1) {
        const wait = 2000 * (i + 1) + Math.floor(Math.random() * 800)
        debugLog(`[qzone-retry] ${i + 1}/${tries}${busy ? ' busy' : ' empty-body'}, wait ${wait}ms: ${msg || `HTTP ${r.status}`}`)
        await sleep(wait)
        continue
      }
      return j
    } catch (e) {
      last = e
      debugLog('[qzone-retry] network error: ' + e.message)
      if (i < tries - 1) {
        await sleep(1500 * (i + 1))
        continue
      }
      throw e
    }
  }
  throw last || new Error('空间接口失败')
}
