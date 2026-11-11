// 共享 SDK：功能插件只允许从这里导入纯工具函数，不允许直接碰桥接内核。
// 这里只做 re-export，保持单一来源，避免出现第二份实现。
export { parseMessage, toOneBotFileSource } from '../onebot.js'
export {
  formatFileSize,
  formatGroupFiles,
  formatGroupFolders,
  matchFileName,
  sanitizeDownloadName,
} from '../assets.js'
export { synthesizeTts } from '../tts.js'
// 群运营/互动纯函数：feature 通过 SDK 使用，不直接 import 内核。
export * from '../ops.js'
export * from '../engage.js'
export * from '../members.js'
export * from '../verify.js'
export * from '../history.js'
export * from '../recall.js'
