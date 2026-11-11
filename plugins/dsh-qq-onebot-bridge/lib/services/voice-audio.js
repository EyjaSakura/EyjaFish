// 获取语音音频：优先 OneBot get_record，其次 http(s) 下载。
/** @param {any} args */
export async function fetchVoiceAudio({
  message,
  record = {},
  getRecord,
  fetchImpl = fetch,
  debugLog = () => {},
}) {
  const fileRef = record.file || record.path || record.url || ''
  if (fileRef) {
    for (const outFormat of ['mp3', 'wav']) {
      try {
        const data = await getRecord(message.bot, fileRef, outFormat)
        let b64 = typeof data?.base64 === 'string' ? data.base64 : ''
        if (!b64 && typeof data?.file === 'string' && data.file.startsWith('base64://')) b64 = data.file.slice(9)
        if (b64) {
          debugLog(`voice fetched via get_record ${outFormat} (${Math.round(b64.length / 1024)} KB b64)`)
          return { base64: b64, ext: outFormat }
        }
      } catch (error) {
        debugLog(`get_record(${outFormat}) failed: ${error.message}`)
      }
    }
  }
  const url = record.url || record.path
  if (url && /^https?:\/\//.test(url)) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`voice download HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) throw new Error('voice download empty')
    debugLog(`voice fetched via url (${buffer.length} bytes)`)
    return { base64: buffer.toString('base64'), ext: 'mp3' }
  }
  throw new Error('无法获取语音文件（get_record 与 url 均失败）')
}
