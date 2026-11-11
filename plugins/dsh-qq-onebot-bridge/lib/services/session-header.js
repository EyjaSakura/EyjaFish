// 读取会话目录首帧（zstd 压缩 JSONL）里的 header 对象。
/** @param {any} args */
export function readHeaderAt({
  dir,
  readdir,
  join,
  readFile,
  zstdDecompressSync,
  debugLog = () => {},
}) {
  if (typeof zstdDecompressSync !== 'function') return undefined
  let file = ''
  try {
    for (const name of readdir(dir)) {
      if (name.startsWith('session.') && name.endsWith('.jsonl.zstd')) file = join(dir, name)
    }
  } catch { return undefined }
  if (file === '') return undefined
  try {
    const buf = readFile(file)
    const magic = [0x28, 0xb5, 0x2f, 0xfd]
    let end = buf.length
    for (let i = 4; i + 3 < buf.length; i += 1) {
      if (buf[i] === magic[0] && buf[i + 1] === magic[1] && buf[i + 2] === magic[2] && buf[i + 3] === magic[3]) { end = i; break }
    }
    const text = zstdDecompressSync(buf.subarray(0, end)).toString('utf8')
    const parsed = JSON.parse(text.split('\n', 1)[0])
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined
  } catch (error) {
    debugLog(`reconcile: cannot read header at ${dir}: ${error.message}`)
    return undefined
  }
}
