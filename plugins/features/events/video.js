// 自动抽取自 bridge.js #handleIncomingVideo
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export async function handleIncomingVideo({ message, bridge, defineTool, debugLog }) {
  const raw = message.raw && message.raw.message
  if (!Array.isArray(raw)) return
  const isVideoFile = (x) => x && (x.type === 'video' || (x.type === 'file' && /\.(mp4|mov|mkv|webm|avi|flv)$/i.test(String(x.data?.name || x.data?.file || ''))))
  const seg = raw.find(isVideoFile)
  if (!seg) return
  const d = seg.data || {}
  const dir = 'D:\\DSH\\qqbot\\qq-videos'
  let saved = ''
  try {
    mkdirSync(dir, { recursive: true })
    let url = d.url || ''
    let rawPath = ''
    if (!/^https?:\/\//.test(url)) { // [qq-video-file] 用 get_file 换取本地路径/URL
      try {
        const socket = bridge.server.currentSocket()
        const r = await bridge.server.action(socket, 'get_file', { file_id: d.file_id || d.file || '', file: d.file || '' })
        url = r?.url || r?.data?.url || ''
        rawPath = r?.file || r?.data?.file || ''
        if (r?.base64) {
          const file = join(dir, 'qq-' + Date.now() + '.mp4')
          writeFileSync(file, Buffer.from(String(r.base64).replace(/^base64:\/\//, ''), 'base64'))
          saved = file
        }
      } catch (e) { debugLog('[qq-video] get_file failed: ' + e.message) }
    }
    if (!saved && /^https?:\/\//.test(url)) {
      const resp = await fetch(url, { signal: AbortSignal.timeout(180000) })
      const buf = Buffer.from(await resp.arrayBuffer())
      const file = join(dir, 'qq-' + Date.now() + '.mp4')
      writeFileSync(file, buf)
      saved = file
    }
    if (!saved && rawPath) {
      if (rawPath.startsWith('/')) { // WSL 路径
        const win = '\\\\wsl.localhost\\Ubuntu' + rawPath.replace(/\//g, '\\')
        if (existsSync(win)) saved = win
      } else if (existsSync(rawPath)) saved = rawPath
    }
  } catch (e) { debugLog('[qq-video] save failed: ' + e.message) }
  if (saved) {
    message.__videoSaved = saved // [video-skip-transfer]
    message.text = String(message.text || '') + '\n[视频] 已保存到 ' + saved + '；用 douyin_analyze_video 传 file 分析，然后回复我。'
    debugLog('[qq-video] saved ' + saved)
  } else {
    message.text = String(message.text || '') + '\n[视频] 收到一条视频，但下载失败。'
    debugLog('[qq-video] failed (no url/path)')
  }
}
