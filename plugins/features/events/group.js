// 自动抽取自 bridge.js #handleGroupFiles
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { formatFileSize, formatGroupFiles, formatGroupFolders, matchFileName, sanitizeDownloadName } from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

export async function handleGroupFiles({ message, text, bridge, defineTool, debugLog }) {
  if (message.messageType !== 'group') return false
  const t = String(text ?? '').trim()
  // 命令后必须跟空白分隔，否则会撞车：`/取消精华` 曾被 `/取` 前缀吃掉（与 /vote-end 同一类坑）。
  const listCmd = /^[\/／](?:文件|群文件)(?:\s+(.*))?$/.exec(t)
  const getCmd = /^[\/／]取(?:\s+(.*))?$/.exec(t)
  if (!listCmd && !getCmd) return false
  if (bridge.config.groupFileEnabled === false || !bridge.canRun(message, 'cmd.groupfiles').allowed) {
    await bridge.safeReply(message, '⚠️ 群文件功能当前关闭（groupFileEnabled=false）。')
    return true
  }
  const socket = bridge.server.currentSocket()
  if (!socket) {
    await bridge.safeReply(message, '⚠️ 当前无可用连接，稍后再试。')
    return true
  }
  const limit = Math.max(1, Number(bridge.config.groupFileListLimit) || 20)
  try {
    if (listCmd) {
      const folderQuery = String(listCmd[1] ?? '').trim()
      if (folderQuery === '') {
        const root = (await bridge.server.getGroupRootFiles(socket, message.groupId)) ?? {}
        if (bridge.dryRunAck(root)) {
          await bridge.safeReply(message, '（回放/注入模式不访问 QQ，取不到真实群文件列表）')
          return true
        }
        const files = Array.isArray(root.files) ? root.files : []
        const folders = Array.isArray(root.folders) ? root.folders : []
        const folderText = formatGroupFolders(folders, { limit }).text
        const fileText = formatGroupFiles(files, { limit }).text
        const body = folders.length > 0 ? `${folderText}\n${fileText}` : fileText
        await bridge.safeReply(message, `${body}\n提示：进文件夹用 /文件 文件夹名，下载用 /取 文件名`)
        return true
      }
      const root = (await bridge.server.getGroupRootFiles(socket, message.groupId)) ?? {}
      if (bridge.dryRunAck(root)) {
        await bridge.safeReply(message, '（回放/注入模式不访问 QQ，取不到真实文件夹列表）')
        return true
      }
      const folders = Array.isArray(root.folders) ? root.folders : []
      const needle = folderQuery.toLowerCase()
      const folder = folders.find((item) => String(item?.folder_name ?? '').toLowerCase() === needle)
        ?? folders.find((item) => String(item?.folder_name ?? '').toLowerCase().includes(needle))
      if (!folder) {
        await bridge.safeReply(message, `没有找到文件夹「${folderQuery.slice(0, 20)}」`)
        return true
      }
      const inside = (await bridge.server.getGroupFilesByFolder(socket, message.groupId, folder.folder_id)) ?? {}
      const files = Array.isArray(inside.files) ? inside.files : []
      await bridge.safeReply(message, `${formatGroupFiles(files, { limit, title: `群文件 · ${folder.folder_name ?? ''}` }).text}\n下载用 /取 文件名`)
      return true
    }
    if (bridge.config.groupFileDownloadEnabled === false) {
      await bridge.safeReply(message, '⚠️ 群文件下载当前关闭（groupFileDownloadEnabled=false）。')
      return true
    }
    const fileName = String(getCmd[1] ?? '').trim()
    if (fileName === '') {
      await bridge.safeReply(message, '用法：/取 文件名（先 /文件 看有哪些文件）')
      return true
    }
    const root = (await bridge.server.getGroupRootFiles(socket, message.groupId)) ?? {}
    if (bridge.dryRunAck(root)) {
      await bridge.safeReply(message, '（回放/注入模式不访问 QQ，取不到真实群文件列表）')
      return true
    }
    const files = Array.isArray(root.files) ? root.files : []
    const found = matchFileName(files, fileName)
    if (!found.file) {
      await bridge.safeReply(message, `⚠️ ${found.reason}`)
      return true
    }
    const size = Number(found.file.file_size) || 0
    const maxBytes = Math.max(1024, Number(bridge.config.groupFileMaxBytes) || 50 * 1024 * 1024)
    if (size > maxBytes) {
      await bridge.safeReply(message, `⚠️ 这个文件 ${formatFileSize(size)}，超过下载上限 ${formatFileSize(maxBytes)}。`)
      return true
    }
    // 私聊投递会被闸门拒时不要白下载：单文件上限 50 MiB，反复 /取 可以把磁盘吃满。
    const deliverKey = bridge.chatKeyOf({ bot: message.bot, messageType: 'private', targetId: message.userId })
    const deliverable = bridge.gate.check('upload_private_file', deliverKey)
    if (!deliverable.ok) {
      await bridge.safeReply(message, `⚠️ 现在没法把文件发到你的私聊（${deliverable.reason}），过一会儿再 /取 吧。`)
      return true
    }
    const info = await bridge.server.getGroupFileUrl(socket, message.groupId, found.file.file_id, found.file.busid)
    if (bridge.dryRunAck(info)) throw new Error('回放/注入模式不访问 QQ，取不到下载地址')
    const url = String(info?.url ?? '')
    if (!/^https?:/i.test(url)) throw new Error('没有取到下载地址')
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) throw new Error('空文件')
    if (buffer.length > maxBytes) throw new Error(`文件超过上限 ${formatFileSize(maxBytes)}`)
    mkdirSync(bridge.filesDir, { recursive: true })
    const safeName = sanitizeDownloadName(found.file.file_name || `group-file-${Date.now().toString(36)}`)
    let target = join(bridge.filesDir, safeName)
    if (existsSync(target)) {
      const stem = safeName.replace(/\.[^.]+$/, '')
      target = join(bridge.filesDir, `${stem}-${Date.now().toString(36)}${extname(safeName)}`)
    }
    writeFileSync(target, buffer)
    debugLog(`group file downloaded ${target} (${buffer.length} bytes)`)
    // 一律私聊交付：群里只留一句提示，不把文件丢进群刷屏。
    const route = { bot: message.bot ?? socket, messageType: 'private', targetId: message.userId }
    try {
      await bridge.sendFileTo(route, target, safeName)
      await bridge.safeReply(message, `✅ 已把「${safeName}」发到你的私聊（${formatFileSize(buffer.length)}）`)
    } catch (error) {
      // 不把本机绝对路径发进群：那会把部署者的用户名与目录结构泄露给所有群成员。
      // 完整路径只写进本机调试日志。
      debugLog(`group file saved locally at ${target} (private delivery failed: ${error.message})`)
      await bridge.safeReply(message, `✅ 已下载「${safeName}」（${formatFileSize(buffer.length)}），但私聊发送失败：${error.message.slice(0, 60)}`)
    }
    return true
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 群文件操作失败：${error.message.slice(0, 80)}`)
    return true
  }
}
