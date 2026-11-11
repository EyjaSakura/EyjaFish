// 事件功能插件：私聊文件 / 入站视频 / 群文件 / 通知
import { handlePrivateFiles } from './private.js'
import { handleIncomingVideo } from './video.js'
import { handleGroupFiles } from './group.js'
import { onNotice } from './notice.js'

export const hooks = { handlePrivateFiles, handleIncomingVideo, handleGroupFiles, onNotice }
