// 发送本地文件：Windows 路径先投递到 WSL 可读目录，再走 OneBot 上传。
/** @param {any} args */
export async function sendFileTo({
  route,
  file,
  name = '',
  chatKey,
  gate,
  server,
  mkdir,
  copy,
  join,
  basename,
  stat,
  now = Date.now(),
  debugLog = () => {},
}) {
  const action = route.messageType === 'group' ? 'upload_group_file' : 'upload_private_file'
  // [wsl-file] 插件在 Windows、NapCat 在 WSL：D:\ 路径在 Linux 端不存在。
  let target = file
  try {
    if (/^[a-zA-Z]:[\\/]/.test(String(file))) {
      const dir = '\\\\wsl.localhost\\Ubuntu\\tmp\\qq-send'
      mkdir(dir, { recursive: true })
      const safe = `${now.toString(36)}-${basename(file).replace(/[^\w.\-]/g, '_')}`
      copy(file, join(dir, safe))
      target = `/tmp/qq-send/${safe}`
    }
  } catch (error) {
    debugLog(`wsl file copy failed, sending raw path: ${error.message}`)
  }
  const result = await gate.run(action, chatKey, basename(file), () => server.uploadFile(
    route.bot, route.messageType, route.targetId, target, name || basename(file), '',
  ))
  if (!result.ok) throw new Error(`发送被限流：${result.reason}`)
  debugLog(`agent file sent (${target})`)
  let size = 0
  try { size = stat(file).size } catch { /* keep 0 */ }
  return `已发送文件：${name || basename(file)}（${Math.round(size / 1024)} KB）`
}
