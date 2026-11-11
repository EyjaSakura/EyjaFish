// GIF 首帧提取（ffmpeg），失败/未开启返回 null。
/** @param {any} args */
export function extractGifFrame({
  file,
  config = {},
  exists,
  execFile,
  debugLog = () => {},
}) {
  return new Promise((resolve) => {
    if (!config.gifFrameExtract) { resolve(null); return }
    if (!String(file).toLowerCase().endsWith('.gif')) { resolve(null); return }
    const out = String(file).replace(/\.gif$/i, '') + '-frame.png'
    if (exists(out)) { resolve(out); return }
    execFile(config.ffmpegPath || 'ffmpeg', ['-y', '-i', file, '-frames:v', '1', out], { timeout: 20_000 }, (error) => {
      if (error) {
        debugLog(`gif frame extract failed: ${error.message}`)
        resolve(null)
        return
      }
      resolve(exists(out) ? out : null)
    })
  })
}
