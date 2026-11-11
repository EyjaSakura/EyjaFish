// 回收站二次清理：按日期桶保留 N 天，并按总字节上限淘汰最老的桶。
// 纯逻辑 + 注入 fs，便于单测。

export function pruneTrash({
  dir,
  keepDays = 30,
  maxBytes = 0,
  now = Date.now(),
  exists,
  readdir,
  stat,
  rm,
}) {
  if (!exists(dir)) return { buckets: 0, files: 0, bytes: 0 }
  const days = Math.max(1, Number(keepDays) || 30)
  const limit = Math.max(0, Number(maxBytes) || 0)
  const cutoff = new Date(now - days * 86_400_000).toISOString().slice(0, 10)
  const buckets = []
  for (const name of readdir(dir)) {
    const full = dir.replace(/[\\/]+$/, '') + '\\' + name
    let info
    try { info = stat(full) } catch { continue }
    if (!info.isDirectory()) continue
    let bytes = 0
    let files = 0
    try {
      for (const leaf of readdir(full)) {
        try {
          const leafInfo = stat(full.replace(/[\\/]+$/, '') + '\\' + leaf)
          if (leafInfo.isFile()) { bytes += leafInfo.size; files += 1 }
        } catch { /* 单文件读不到跳过 */ }
      }
    } catch { /* 单桶读不到跳过 */ }
    buckets.push({ name, full, bytes, files })
  }
  buckets.sort((a, b) => a.name.localeCompare(b.name)) // 日期升序 = 最老在前
  const doomed = []
  const doomedNames = new Set()
  for (const bucket of buckets) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bucket.name)) continue
    if (bucket.name >= cutoff) break
    doomed.push(bucket)
    doomedNames.add(bucket.name)
  }
  if (limit > 0) {
    let liveBytes = buckets.reduce((sum, bucket) => sum + bucket.bytes, 0)
    for (const bucket of buckets) {
      if (liveBytes <= limit) break
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bucket.name)) continue
      if (doomedNames.has(bucket.name)) continue
      doomed.push(bucket)
      doomedNames.add(bucket.name)
      liveBytes -= bucket.bytes
    }
  }
  let removedFiles = 0
  let removedBytes = 0
  for (const bucket of doomed) {
    removedFiles += bucket.files
    removedBytes += bucket.bytes
    try { rm(bucket.full, { recursive: true, force: true }) } catch { /* 单个桶删除失败不影响其它 */ }
  }
  return { buckets: doomed.length, files: removedFiles, bytes: removedBytes, keepDays: days, maxBytes: limit }
}
