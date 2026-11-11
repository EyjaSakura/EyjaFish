// 跨模块共享的命令常量。

export const MAX_QQ_MESSAGE_CHARS = 1700

export const OPS_ARG_WORDS = [
  '设管理', '撤管理', '邀请策略', '加群方式', '批量踢', '待办', '完成待办', '取消待办',
  '移动文件', '重命名文件', '删文件', '新建文件夹', '传图', '群名', '群备注', '群权限', '历史可见',
  '打卡名册', '禁言名单', '全体余量', '群详细', '入群通知', '管理员名单',
]

export const ADMIN_COMMAND_CAPABILITY = {
  mute: 'group.ops.mute',
  unmute: 'group.ops.mute',
  全员禁言: 'group.ops.mute',
  解除全员禁言: 'group.ops.mute',
  kick: 'group.ops.kick',
  clear: 'group.ops.clear',
  公告: 'group.ops.notice',
  精华: 'group.ops.essence',
  取消精华: 'group.ops.essence',
  名片: 'group.ops.card',
  头衔: 'group.ops.title',
  退群: 'group.ops.leave',
}
