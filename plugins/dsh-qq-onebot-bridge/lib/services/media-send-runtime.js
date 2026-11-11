// Outbound image/file/voice send runtime. Bridges QQ segments and local files;
// no QQ message parsing or agent logic lives here.
import { basename, join } from 'node:path'
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { toOneBotFileSource, windowsPathToFileUri } from '../onebot.js'
import { sendImageTo as sendImageToService } from './send-image.js'
import { prepareImageForSend as prepareImageForSendService } from './image-compress.js'
import { sendFileTo as sendFileToService } from './send-file.js'
import { sendVoiceTo as sendVoiceToService } from './send-voice.js'
import { debugLog } from '../core/debug-log.js'

export function createMediaSendRuntime({ config, server, mediaDir, gate, trackSent, chatKeyOf, synthVoiceFile }) {
  async function sendImageBuffer(route, buffer, caption = '') {
    if (!buffer || !buffer.length) throw new Error('图片内容为空')
    const segments = []
    if (caption) segments.push({ type: 'text', data: { text: String(caption) } })
    segments.push({ type: 'image', data: { file: 'base64://' + buffer.toString('base64') } })
    await server.sendSegments(route.bot, route.messageType, route.targetId, segments)
    debugLog(`agent image buffer sent (${buffer.length} bytes)`)
  }

  function prepareImageForSend(file) {
    return prepareImageForSendService({
      file,
      config,
      mediaDir,
      stat: statSync,
      mkdir: mkdirSync,
      rm: rmSync,
      execFile,
      join,
      debugLog,
    })
  }

  async function sendImageTo(route, file, caption = '') {
    return sendImageToService({
      route,
      file,
      caption,
      prepareImage: (f) => prepareImageForSend(f),
      toOneBotFileSource,
      windowsPathToFileUri,
      sendSegments: (bot, type, target, segs) => server.sendSegments(bot, type, target, segs),
      trackSent: (key, data) => trackSent(key, data),
      chatKeyOf: (r) => chatKeyOf(r),
      stat: statSync,
      basename,
      debugLog,
    })
  }

  async function sendFileTo(route, file, name = '') {
    return sendFileToService({
      route,
      file,
      name,
      chatKey: chatKeyOf(route),
      gate,
      server,
      mkdir: mkdirSync,
      copy: copyFileSync,
      join,
      basename,
      stat: statSync,
      debugLog,
    })
  }

  function ttsUsable() {
    if (config.ttsProvider === 'edge') return true
    if (config.ttsProvider === 'sapi') return true
    if (config.ttsProvider === 'local') return Boolean(config.ttsLocalRefAudio)
    return Boolean(config.ttsApiKey)
  }

  async function sendVoiceTo(route, text) {
    return sendVoiceToService({
      route,
      text,
      config,
      ttsUsable: () => ttsUsable(),
      synthVoiceFile: (spoken) => synthVoiceFile(spoken),
      toOneBotFileSource,
      readFile: (file) => readFileSync(file),
      sendSegments: (bot, type, target, segs) => server.sendSegments(bot, type, target, segs),
      trackSent: (key, data) => trackSent(key, data),
      chatKeyOf: (r) => chatKeyOf(r),
      debugLog,
    })
  }

  return { sendImageBuffer, sendImageTo, prepareImageForSend, sendFileTo, ttsUsable, sendVoiceTo }
}
