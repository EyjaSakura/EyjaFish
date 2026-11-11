// 发送前压缩过大的图片（ffmpeg），失败保留原文件。
/** @param {any} args */
export async function prepareImageForSend({
  file,
  config = {},
  mediaDir,
  stat,
  mkdir,
  rm,
  execFile,
  join,
  now = Date.now(),
  debugLog = () => {},
}) {
  const limit = Math.max(10240, Number(config.imageSendMaxBytes) || 4 * 1024 * 1024)
  let size = 0
  try { size = stat(file).size } catch { return file }
  if (size <= limit) return file
  try {
    mkdir(mediaDir, { recursive: true })
    const out = join(mediaDir, `img-${now.toString(36)}.jpg`)
    await new Promise((resolve, reject) => {
      execFile(config.ffmpegPath || 'ffmpeg', [
        '-y', '-i', file,
        '-vf', 'scale=1920:-2:force_original_aspect_ratio=decrease',
        '-q:v', '3', out,
      ], { timeout: 60_000 }, (error) => (error ? reject(error) : resolve()))
    })
    const compressed = stat(out).size
    if (compressed > 0 && compressed < size) {
      debugLog(`image compressed ${Math.round(size / 1024)}KB → ${Math.round(compressed / 1024)}KB`)
      return out
    }
    rm(out, { force: true })
    return file
  } catch (error) {
    debugLog(`image compression skipped: ${error.message}`)
    return file
  }
}
