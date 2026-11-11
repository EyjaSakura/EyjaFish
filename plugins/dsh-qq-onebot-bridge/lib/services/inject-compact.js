// 注入队列超过阈值且全部消费后压缩，避免 tailer 轮转重读旧注入。
import { renameSync, rmSync, statSync, writeFileSync } from 'node:fs'

/** @param {any} args */
export function compactInjectQueue({
  injectFile,
  injectTailer,
  trace,
  onConsumed = () => {},
  debugLog = () => {},
  stat = statSync,
  rename = renameSync,
  writeFile = writeFileSync,
  rm = rmSync,
}) {
  try {
    const size = stat(injectFile).size
    if (size < 256 * 1024) return
    if (injectTailer.position !== size) return   // 还有没读到的内容，先不压缩
    // 先改名再建空文件：控制台此刻的 append 只会落到新文件上，不会被截断吞掉
    const parking = `${injectFile}.compacted`
    rename(injectFile, parking)
    writeFile(injectFile, '', 'utf8')
    injectTailer.reset(true)
    onConsumed()
    rm(parking, { force: true })
    trace?.event({
      id: '', level: 'info', module: 'bridge', stage: 'inject', ok: true,
      reason: `注入队列已压缩：${Math.round(size / 1024)} KB 全部消费完毕，清空以避免轮转后重复执行旧注入`,
    })
  } catch (error) {
    debugLog(`inject queue compact skipped: ${error.message}`)
  }
}
