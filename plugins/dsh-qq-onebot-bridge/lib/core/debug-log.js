import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'

/**
 * 日志落点：**模块加载阶段还不知道**真实位置（要等桥接实例按 dataRoot 算出来），
 * 所以加载期先攒在内存里，实例构造时再补写。
 * 以前这里默认写 `process.cwd()/qq-bridge-debug.log` —— 数据搬到新根之后，
 * cwd 里还会被凭空造出一个旧布局的日志文件（S4 清理完也照样复现）。
 */
let debugLogPath = ''
let debugLogSize = 0
let debugLogPending = []

const DEBUG_LOG_MAX_BYTES = 2 * 1024 * 1024   // 2 MiB cap
const DEBUG_LOG_KEEP_BYTES = 128 * 1024        // keep the last 128 KiB after rotation
const DEBUG_LOG_PENDING_MAX = 200

/** 设定日志落点（桥接实例构造时调用），并把加载期攒下的行补写进去。 */
function setDebugLogPath(file) {
  try {
    debugLogPath = String(file ?? '')
    if (debugLogPath === '') return
    debugLogSize = existsSync(debugLogPath) ? statSync(debugLogPath).size : 0
    if (debugLogPending.length > 0) {
      appendFileSync(debugLogPath, debugLogPending.map((line) => `${line}\n`).join(''))
      debugLogPending = []
    }
  } catch {
    // 落点定不下来就继续攒着：宁可丢几行加载期日志，也不要往 cwd 里造文件
  }
}

function debugLog(line) {
  try {
    const text = `${new Date().toISOString()} ${line}`
    if (debugLogPath === '') {
      debugLogPending.push(text)
      if (debugLogPending.length > DEBUG_LOG_PENDING_MAX) debugLogPending.shift()
      return
    }
    debugLogSize += Buffer.byteLength(text) + 1
    if (debugLogSize > DEBUG_LOG_MAX_BYTES) {
      // Rotate: keep only the tail so the file never grows unbounded.
      const tail = readFileSync(debugLogPath, 'utf8').slice(-DEBUG_LOG_KEEP_BYTES)
      writeFileSync(debugLogPath, tail, 'utf8')
      debugLogSize = DEBUG_LOG_KEEP_BYTES
    }
    appendFileSync(debugLogPath, `${text}\n`)
  } catch {}
}


export { debugLog, setDebugLogPath }
