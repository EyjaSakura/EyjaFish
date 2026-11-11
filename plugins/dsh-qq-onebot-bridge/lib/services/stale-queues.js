// 启动时清理上一轮遗留：推迟注入队列、过期 outbox、抖音未读积压。
/** @param {any} args */
export function clearStaleQueues({
  loadDeferred,
  deferredFile,
  writeFile,
  loadOutbox,
  saveOutbox,
  setOutbox,
  inbox,
  offsetFile,
  exists,
  readFile,
  now = Date.now(),
  debugLog = () => {},
}) {
  try {
    const store = loadDeferred()
    const count = Object.values(store).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
    if (count > 0) {
      writeFile(deferredFile(), '{}', 'utf8')
      debugLog('[stale-queue] cleared ' + count + ' deferred injection(s) from previous run')
    }
  } catch (error) { debugLog('[stale-queue] deferred clear failed: ' + error.message) }
  try {
    const outbox = loadOutbox()
    const keep = outbox.filter((item) => now - Number(item?.ts ?? 0) < 30 * 60_000)
    if (keep.length !== outbox.length) {
      setOutbox(keep)
      saveOutbox()
      debugLog('[stale-queue] dropped ' + (outbox.length - keep.length) + ' stale outbox message(s)')
    }
  } catch (error) { debugLog('[stale-queue] outbox clear failed: ' + error.message) }
  try {
    if (exists(inbox)) {
      const raw = readFile(inbox)
      let offset = 0
      try { offset = Number(JSON.parse(readFile(offsetFile)).offset) || 0 } catch { offset = 0 }
      const backlog = raw.length - offset
      if (backlog > 20 * 1024) {
        writeFile(offsetFile, JSON.stringify({ offset: raw.length }), 'utf8')
        debugLog('[stale-queue] douyin backlog ' + backlog + ' chars skipped to end')
      }
    }
  } catch (error) { debugLog('[stale-queue] douyin offset failed: ' + error.message) }
}
