// 群运营命令的独立子命令：只读查询、文件整理、相册上传、申请拉取。
// 从 commands/ops.js 拆出，主入口只负责路由；行为保持原样。
import * as qqSdk from '@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js'

const {
  collectPendingRequests, formatAdminList, formatAtAllRemain, formatFileOp,
  formatGroupInfoEx, formatIgnoredNotifies, formatPendingList, formatPullResult,
  formatShutList, formatSignedList, parseOpsArgs, planAlbumUpload, planFileOp,
} = qqSdk

export async function handleOpsReadOnly({ message, raw, bridge, isGroup, groupId, injected, needGroup }) {
  if (!/^[\/／](全体余量|禁言名单|群详细|入群通知|打卡名册|管理员名单)\s*$/.test(raw)) return false
  if (bridge.config.opsReadEnabled === false) {
    await bridge.safeReply(message, '🧰 群运营只读查询已关闭（opsReadEnabled=false）')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsReadEnabled=false' })
    return true
  }
  const which = /^[\/／](全体余量|禁言名单|群详细|入群通知|打卡名册|管理员名单)/.exec(raw)[1]
  if (which !== '入群通知' && !isGroup) return needGroup()
  if (injected) {
    await bridge.safeReply(message, `（回放/注入：未真正访问 QQ）${which} 查询已跳过`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: `${which}：注入/回放回合不访问 QQ` })
    return true
  }
  const socket = message.bot ?? bridge.server.currentSocket()
  try {
    if (which === '全体余量') {
      const result = await bridge.server.getGroupAtAllRemain(socket, groupId)
      await bridge.safeReply(message, formatAtAllRemain(result, { groupId }))
    } else if (which === '禁言名单') {
      const list = await bridge.server.getGroupShutList(socket, groupId)
      await bridge.safeReply(message, formatShutList(list, { groupId }))
    } else if (which === '群详细') {
      const info = await bridge.server.getGroupInfoEx(socket, groupId)
      await bridge.safeReply(message, formatGroupInfoEx(info, { groupId }))
    } else if (which === '打卡名册') {
      const list = await bridge.server.getGroupSignedList(socket, groupId)
      await bridge.safeReply(message, formatSignedList(list, { groupId }))
    } else if (which === '管理员名单') {
      const members = await bridge.server.getGroupMemberList(socket, groupId)
      const formatted = formatAdminList(members, { selfId: bridge.config.botQq, groupName: '' })
      await bridge.safeReply(message, formatted.text)
    } else {
      const result = await bridge.server.getGroupIgnoredNotifies(socket)
      await bridge.safeReply(message, formatIgnoredNotifies(result))
    }
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `${which} 查询完成` })
  } catch (error) {
    await bridge.safeReply(message, `⚠️ ${which} 查询失败：${error.message.slice(0, 80)}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, level: 'warn', reason: `${which} 查询失败：${error.message}` })
  }
  return true
}

export async function handleOpsFileOps({ message, raw, bridge, isGroup, groupId, chatKey, injected, isAdmin, needGroup }) {
  if (!/^[\/／](移动文件|重命名文件|删文件|新建文件夹)(?:\s|$)/.test(raw)) return false
  if (!isGroup) return needGroup()
  if (bridge.config.opsFileEnabled !== true) {
    await bridge.safeReply(message, '🗂 群文件整理未启用（opsFileEnabled=false）')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsFileEnabled=false' })
    return true
  }
  if (!isAdmin) {
    await bridge.safeReply(message, '⚠️ 文件整理仅管理员可用。')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '文件整理仅管理员可用' })
    return true
  }
  const kind = raw.includes('移动文件') ? 'move' : raw.includes('重命名文件') ? 'rename' : raw.includes('删文件') ? 'remove' : 'mkdir'
  const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}${kind === 'move' ? '移动文件' : kind === 'rename' ? '重命名文件' : kind === 'remove' ? '删文件' : '新建文件夹'}`)
  const parts = (parsed.ok ? parsed.arg : '').split(/\s+/).filter(Boolean)
  let plan
  if (kind === 'mkdir') {
    plan = planFileOp({ groupId, kind, folderName: parts.join(' ') })
  } else if (kind === 'move') {
    plan = planFileOp({ groupId, kind, fileId: parts[0] ?? '', targetParent: parts[1] ?? '', currentParent: parts[2] ?? '' })
  } else if (kind === 'rename') {
    plan = planFileOp({ groupId, kind, fileId: parts[0] ?? '', newName: parts.slice(1).join(' '), currentParent: parts[parts.length - 1] ?? '' })
    if (plan.ok && /^\//.test(parts[parts.length - 1] ?? '') && parts.length > 2) {
      plan = planFileOp({ groupId, kind, fileId: parts[0], newName: parts.slice(1, -1).join(' '), currentParent: parts[parts.length - 1] })
    }
  } else {
    plan = planFileOp({ groupId, kind, fileId: parts[0] ?? '' })
  }
  if (!plan.ok) {
    await bridge.safeReply(message, `⚠️ 文件操作失败：${plan.reason}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
    return true
  }
  if (injected) {
    await bridge.safeReply(message, `🗂 文件操作未执行：${bridge.engageBlockedReason('文件整理')}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('文件整理') })
    return true
  }
  const params = /** @type {any} */ (plan.params)
  const call = () => {
    if (kind === 'move') return bridge.server.moveGroupFile(message.bot, params.group_id, params.file_id, params.current_parent_directory, params.target_parent_directory)
    if (kind === 'rename') return bridge.server.renameGroupFile(message.bot, params.group_id, params.file_id, params.current_parent_directory, params.new_name)
    if (kind === 'remove') return bridge.server.deleteGroupFile(message.bot, params.group_id, params.file_id)
    return bridge.server.createGroupFileFolder(message.bot, params.group_id, params.folder_name)
  }
  const gated = await bridge.gate.run(plan.action, chatKey, `${kind} ${params.file_id ?? params.folder_name ?? ''}`, call)
  if (gated.ok !== true) {
    await bridge.safeReply(message, `⚠️ 文件操作被闸门拦下：${gated.reason}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
    return true
  }
  bridge.countOps('fileOp')
  await bridge.safeReply(message, formatFileOp(kind, { ok: true }, String(params.file_id ?? params.folder_name ?? '')))
  bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `文件整理 ${kind} 完成（${plan.action}）` })
  return true
}

export async function handleOpsAlbum({ message, raw, bridge, isGroup, groupId, chatKey, injected, isAdmin, needGroup }) {
  if (!/^[\/／]传图(?:\s|$)/.test(raw)) return false
  if (!isGroup) return needGroup()
  if (bridge.config.opsAlbumUploadEnabled !== true) {
    await bridge.safeReply(message, '🖼 相册上传未启用（opsAlbumUploadEnabled=false）')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'opsAlbumUploadEnabled=false' })
    return true
  }
  if (!isAdmin) {
    await bridge.safeReply(message, '⚠️ 相册上传仅管理员可用。')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '相册上传仅管理员可用' })
    return true
  }
  const parsed = parseOpsArgs(raw, `${raw.slice(0, 1)}传图`)
  const wanted = (parsed.ok ? parsed.arg : '').trim()
  if (wanted === '') {
    await bridge.safeReply(message, '🖼 用法：引用一张图片，发 /传图 <相册ID或相册名>（相册列表用 /相册 看）')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '传图没有给相册 ID 或名字' })
    return true
  }
  const images = (message.images ?? []).map((image) => image?.file ?? image?.url ?? '').filter((value) => String(value) !== '')
  if (images.length === 0) {
    await bridge.safeReply(message, '🖼 没找到图片：请**引用一张图片**再发 /传图 <相册ID或相册名>')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '传图消息里没有图片' })
    return true
  }
  if (injected) {
    await bridge.safeReply(message, `🖼 相册上传未执行：${bridge.engageBlockedReason('相册上传')}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('相册上传') })
    return true
  }
  let albumId = wanted.startsWith('@') ? wanted.slice(1) : ''
  let albumName = wanted
  let listReason = ''
  if (albumId === '') {
    try {
      const list = await bridge.server.getQunAlbumList(message.bot, groupId)
      const albums = Array.isArray(list?.album_list) ? list.album_list : []
      const hit = albums.find((album) => String(album?.album_name ?? '') === wanted)
      if (hit) {
        albumId = String(hit.album_id ?? '')
        albumName = String(hit.album_name ?? wanted)
      } else {
        listReason = albums.length === 0 ? '相册列表是空的' : `相册列表里没有「${wanted}」（有：${albums.slice(0, 5).map((a) => a?.album_name ?? a?.album_id).join('、')}）`
      }
    } catch (error) {
      listReason = `查相册列表失败：${error.message}`
    }
  }
  if (albumId === '') {
    await bridge.safeReply(message, `🖼 找不到相册：${listReason || '请用 /相册 看列表，或用 /传图 @<相册ID> 指定'}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: `相册上传未执行：${listReason || '没有解析到相册 ID'}` })
    return true
  }
  const plan = planAlbumUpload({ groupId, albumId, albumName, file: images[0] })
  if (!plan.ok) {
    await bridge.safeReply(message, `⚠️ 相册上传失败：${plan.reason}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: plan.reason })
    return true
  }
  const gated = await bridge.gate.run(plan.action, chatKey, `album ${albumId}`, () => bridge.server.uploadImageToQunAlbum(message.bot, plan.params.group_id, plan.params.album_id, plan.params.album_name, plan.params.file))
  if (gated.ok !== true) {
    await bridge.safeReply(message, `⚠️ 相册上传被闸门拦下：${gated.reason}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: gated.reason })
    return true
  }
  bridge.countOps('albumUpload')
  await bridge.safeReply(message, `🖼 已上传到相册「${albumName}」${gated.dryRun === true ? '（干跑：没有真的发到 QQ）' : ''}`)
  bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `相册上传完成（${plan.action}，相册 ${albumId}）` })
  return true
}

export async function handleOpsRequestSync({ message, raw, bridge, isAdmin, injected }) {
  if (!/^[\/／]申请\s*$/.test(raw)) return false
  if (bridge.config.requestSyncEnabled !== true) {
    await bridge.safeReply(message, '📡 申请拉取未启用（requestSyncEnabled=false）')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: 'requestSyncEnabled=false' })
    return true
  }
  if (!isAdmin) {
    await bridge.safeReply(message, '⚠️ 申请拉取仅管理员可用。')
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: '申请拉取仅管理员可用' })
    return true
  }
  if (injected) {
    await bridge.safeReply(message, `📡 申请未拉取：${bridge.engageBlockedReason('申请拉取')}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, reason: bridge.engageBlockedReason('申请拉取') })
    return true
  }
  const socket = message.bot ?? bridge.server.currentSocket()
  const count = Math.max(1, Math.min(100, Number(bridge.config.requestSyncCount) || 50))
  try {
    bridge.joinGuard.expire()
    const systemMsg = await bridge.server.getGroupSystemMsg(socket, count)
    let doubts = []
    let doubtError = ''
    try {
      doubts = await bridge.server.getDoubtFriendsAddRequest(socket, count)
    } catch (error) {
      doubtError = error.message
    }
    const apiRaw = (Array.isArray(systemMsg?.join_requests) ? systemMsg.join_requests.length : 0)
      + (Array.isArray(systemMsg?.invited_requests) ? systemMsg.invited_requests.length : 0)
      + (Array.isArray(doubts) ? doubts.length : 0)
    const candidates = collectPendingRequests({ systemMsg, doubts, groupId: message.groupId })
    const invalid = Math.max(0, apiRaw - candidates.length)
    if (bridge.config.verifyEnabled !== true) {
      const preview = candidates.slice(0, 10).map((item) => `· ${item.userId || '未知'} ${item.groupId ? `入群 ${item.groupId}` : '加好友'}${item.comment ? `｜${item.comment.slice(0, 20)}` : ''}`)
      await bridge.safeReply(message, [
        `📡 已向 QQ 拉取申请：接口共返回 ${apiRaw} 条，其中 ${candidates.length} 条未处理${invalid > 0 ? `（${invalid} 条已处理或缺少 ID）` : ''}`,
        ...(preview.length > 0 ? ['· 预览：', ...preview] : []),
        '',
        '⚠️ 未并入待审队列：verifyEnabled=false，没有 /同意、/拒绝 可用。要能审批请先在配置里打开 verifyEnabled。',
      ].join('\n'))
      bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `申请拉取（只读）：接口 ${apiRaw} 条，未入队（verifyEnabled=false）` })
      return true
    }
    const room = Math.max(0, bridge.joinGuard.maxPending - bridge.joinGuard.size)
    const adopted = []
    let already = 0
    let full = 0
    let failed = 0
    for (const item of candidates) {
      if (bridge.joinGuard.find(item.flag)) {
        already += 1
        continue
      }
      if (adopted.length >= room) {
        full += 1
        continue
      }
      const added = bridge.joinGuard.addRequest({ ...item, adopt: true })
      if (added) adopted.push({ ...item, id: added.id })
      else failed += 1
    }
    const lines = [formatPullResult({ adopted, already, full, invalid, failed, raw: apiRaw, pendingMax: bridge.joinGuard.maxPending })]
    if (doubtError !== '') lines.push(`· 可疑好友申请拉取失败：${doubtError.slice(0, 60)}`)
    lines.push('', formatPendingList(bridge.joinGuard.list()))
    await bridge.safeReply(message, lines.join('\n'))
    bridge.countOps('pullRequest', adopted.length)
    bridge.trace?.event({ id: '', stage: 'ops', ok: true, reason: `申请拉取完成：接口 ${apiRaw} 条，新并入 ${adopted.length} 条，已在队列 ${already} 条，已处理/无效 ${invalid} 条，队列满未并入 ${full} 条` })
  } catch (error) {
    await bridge.safeReply(message, `⚠️ 申请拉取失败：${error.message.slice(0, 80)}`)
    bridge.trace?.event({ id: '', stage: 'ops', ok: false, level: 'warn', reason: `申请拉取失败：${error.message}` })
  }
  return true
}
