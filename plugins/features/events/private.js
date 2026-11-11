// 自动抽取自 bridge.js #handlePrivateFiles
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, basename, dirname, extname } from 'node:path'

export async function handlePrivateFiles({ message, bridge, defineTool, debugLog }) {
  const lines = []
  for (const f of (message.files ?? []).slice(0, 4)) {
    const rawFile = String(f.file || '')
    const inferred = !f.name && /\.[a-z0-9]{1,8}$/i.test(rawFile) ? basename(rawFile) : ''
    const name = f.name ? basename(String(f.name)) : (inferred || `file-${Date.now().toString(36)}`)
    const maxBytes = Math.max(1, Number(bridge.config.fileTransferMaxBytes) || 50 * 1024 * 1024)
    let buffer = null
    let localFile = ''
    let url = /^https?:\/\//.test(String(f.url ?? '')) ? String(f.url) : ''
    const fileId = String(f.file || f.file_id || '')

    try {
      // QQ 私聊文件通常只给 file id，不给 URL；先用 get_file 换 URL / 本地路径 / base64。
      if (buffer === null && url === '' && fileId !== '') {
        const socket = message.bot ?? bridge.server.currentSocket()
        let data = null
        try {
          const result = await bridge.server.action(socket, 'get_file', { file_id: fileId, file: fileId })
          data = result?.data && typeof result.data === 'object' ? result.data : result
        } catch (error) {
          debugLog(`[qq-file] get_file failed: ${error.message}`)
        }
        if (!data || (!data.base64 && !data.url && !data.file)) {
          try {
            const result = await bridge.server.action(socket, 'get_private_file_url', { user_id: String(message.userId ?? ''), file_id: fileId })
            data = result?.data && typeof result.data === 'object' ? result.data : result
          } catch (error) {
            debugLog(`[qq-file] get_private_file_url failed: ${error.message}`)
          }
        }
        if (typeof data?.base64 === 'string' && data.base64 !== '') {
          buffer = Buffer.from(data.base64.replace(/^base64:\/\//, ''), 'base64')
        }
        if (url === '' && /^https?:\/\//.test(String(data?.url ?? ''))) url = String(data.url)
        localFile = String(data?.file ?? '')
      }

      if (buffer === null && url !== '') {
        const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        buffer = Buffer.from(await response.arrayBuffer())
      }

      if (buffer === null && localFile !== '') {
        if (localFile.startsWith('/')) {
          const win = '\\\\wsl.localhost\\Ubuntu' + localFile.replace(/\//g, '\\')
          if (existsSync(win)) localFile = win
        }
        if (existsSync(localFile)) buffer = readFileSync(localFile)
      }

      if (buffer === null) {
        if (!/\.(mp4|mov|mkv|webm|avi|flv)$/i.test(name)) lines.push(`⚠️ 文件「${f.name || '未知'}」没有可下载链接`)
        continue
      }
      if (buffer.length === 0) throw new Error('空文件')
      if (buffer.length > maxBytes) throw new Error('文件过大（超限）')

      mkdirSync(bridge.filesDir, { recursive: true })
      let file = join(bridge.filesDir, name)
      if (existsSync(file)) {
        const stem = name.replace(/\.[^.]+$/, '')
        const ext = extname(name)
        file = join(bridge.filesDir, `${stem}-${Date.now().toString(36)}${ext}`)
      }
      writeFileSync(file, buffer)
      lines.push(`✅ 已保存：${file}（${Math.round(buffer.length / 1024)} KB）`)
      debugLog(`file saved ${file}`)

      // [sing-ingest] 白名单发来的音频自动进曲库
      if (/\.(flac|mp3|wav|m4a|ogg)$/i.test(name)) {
        const sender = String(message?.userId ?? '')
        const whitelist = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String)
        if (whitelist.includes(sender)) {
          try {
            const incoming = 'D:\\DSH\\sing\\library\\incoming'
            mkdirSync(incoming, { recursive: true })
            let dest = join(incoming, name)
            if (existsSync(dest)) {
              const stem = name.replace(/\.[^.]+$/, '')
              const ext = extname(name)
              dest = join(incoming, `${stem}-${Date.now().toString(36)}${ext}`)
            }
            copyFileSync(file, dest)
            lines.push(`🎵 已放进曲库 incoming：${basename(dest)}`)
            if (!existsSync('D:\\DSH\\sing\\logs\\ingest.lock')) {
              const child = spawn('D:\\DSH\\voice\\env\\Scripts\\python.exe',
                ['D:\\DSH\\sing\\library\\ingest_song.py', '--all'],
                { cwd: 'D:\\DSH\\sing\\library', detached: true, stdio: 'ignore', windowsHide: true })
              child.unref()
              lines.push('入库任务已启动（单首约 5-6 分钟），完成后我会学结构。')
            } else {
              lines.push('已有入库任务在跑，这首会排在后面。')
            }
          } catch (audioErr) {
            lines.push('放进曲库失败：' + String(audioErr.message).slice(0, 60))
          }
        }
      }
    } catch (error) {
      debugLog(`file transfer failed: ${error.message}`)
      lines.push(`⚠️ 保存失败：${error.message.slice(0, 60)}`)
    }
  }
  await bridge.safeReply(message, lines.join('\n'))
}
