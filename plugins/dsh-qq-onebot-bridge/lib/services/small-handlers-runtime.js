// Small read-only command wrappers.
import { handleFriendList as handleFriendListService } from './friend-list.js'
import { handleGroupRead as handleGroupReadService } from './group-read.js'

export async function handleFriendList({ bridge, message, text }) {
  return handleFriendListService({
    message,
    text,
    config: bridge.config,
    canRun: (m, cap) => bridge.canRun(m, cap),
    server: bridge.server,
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}

export async function handleGroupRead({ bridge, message, text }) {
  return handleGroupReadService({
    message,
    text,
    server: bridge.server,
    safeReply: (m, t) => bridge.safeReply(m, t),
  })
}
