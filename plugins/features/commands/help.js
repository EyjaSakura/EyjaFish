// 自动抽取自 bridge.js #handleHelp
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export async function handleHelp({ message, bridge, defineTool, debugLog }) {
  const isAdmin = bridge.isAdmin(message)
  const lines = [
    '🐋 小鲸鱼使用指南',
    '· 聊天：群里 @我 说话，或直接私聊我',
    '· /new 新对话 · /status 会话状态 · /health 运行诊断',
    '· 提醒：「30分钟后提醒我喝水」· /reminders 查看提醒',
    '· /summary 群聊总结 · 投票：「投票：问题？A xx B xx」',
    '· 待办：「/todo add xx」或「记一下：xx」',
    '· /撤回 撤回我上一条消息 · /export 导出聊天记录 · /help 本菜单',
  ]
  // [本地补丁] 工作区切换只对 owner 展示（guest 无此权限）。
  if (bridge.canSwitchWorkspace(message)) {
    lines.push('· 工作区：/ws 看列表 · /ws <名字或序号> 在该工作区最新会话里继续 · /ws off 退出')
  }
  if (bridge.config.voiceReadingEnabled) {
    lines.push('· 语音朗读：@我 引用文字说「读一下」，或 /读 要读的内容')
  }
  if (bridge.config.imageGenEnabled) {
    lines.push(`· 生图：${bridge.config.imageGenCommand || '/画'} 描述词（群聊需 @我）`)
  }
  if (bridge.config.sttEnabled) {
    lines.push('· 语音转文字：@我 并引用一条语音')
  }
  if (bridge.config.checkinEnabled) {
    lines.push(`· 签到：说「${bridge.config.checkinKeyword || '签到'}」打卡 · 签到榜 看排行`)
  }
  if (bridge.config.fortuneEnabled) {
    lines.push('· 今日人品 / 运势 / 抽签 / 塔罗：直接说「今日人品」「抽签」「塔罗」')
  }
  if (bridge.config.diceEnabled) {
    lines.push('· 骰子：.r 3d6 · 随机抽人：/抽一个 A B C')
  }
  if (bridge.config.pointsEnabled) {
    lines.push('· 积分：/积分 查余额 · /排行榜 看排行 · /转账 @某人 数量')
  }
  if (bridge.config.gameEnabled) {
    lines.push('· 小游戏：说「接龙」或「猜数字」开始，说「不玩了」结束')
  }
  if (bridge.config.statsEnabled) {
    lines.push('· 活跃榜：/统计（今日）· /周榜（本周）')
  }
  if (bridge.config.groupReadEnabled !== false && message.messageType === 'group') {
    lines.push('· 群信息：/荣誉 · /公告 · /群精华 · /群信息（只读查询）')
  }
  if (bridge.config.memberQueryEnabled !== false && message.messageType === 'group') {
    lines.push('· 成员：/成员 看名单 · /成员 @某人 看详情（身份/等级/入群时间/禁言）')
  }
  if (bridge.config.groupFileEnabled !== false && message.messageType === 'group') {
    lines.push('· 群文件：/文件 看目录 · /文件 文件夹名 · /取 文件名（下载后发到你私聊）')
  }
  if (bridge.config.albumEnabled !== false && message.messageType === 'group') {
    lines.push('· 群相册：/相册')
  }
  if (bridge.config.ocrEnabled !== false) {
    lines.push('· 识图：引用一张图片发 /ocr，把图里的文字读出来')
  }
  if (bridge.config.historySearchEnabled !== false) {
    lines.push(`· 找历史：/找 关键词（搜本会话最近 ${Math.max(1, Number(bridge.config.historySearchDays) || 7)} 天的本地归档）`)
  }
  if (bridge.config.friendListEnabled === true && message.messageType === 'private' && isAdmin) {
    lines.push('· 好友列表：/好友（隐私项，默认关闭）')
  }
  if (bridge.config.mcStatusEnabled !== false) {
    lines.push('· MC 服务器状态：/mc mc.example.com:25565')
  }
  if (bridge.config.dailyReportEnabled && bridge.config.adminEnabled && isAdmin) {
    lines.push('· 每日日报：/日报 查看 · /日报 on|off 开关本群日报')
  }
  if (bridge.config.keywordEnabled && bridge.config.adminEnabled && isAdmin) {
    lines.push('· 词库：/kw add 触发词 回复内容 · /kw del 触发词 · /kw list')
  }
  if (bridge.config.adminEnabled && isAdmin) {
    lines.push('· 管理：/mute /unmute /kick /clear（踢人需二次确认）')
    if (message.messageType === 'group') {
      lines.push('· 群管：/公告 内容 · /全员禁言 · /解除全员禁言 · /精华（引用消息）· /名片 @某人 名字 · /头衔 @某人 头衔')
      if (bridge.config.leaveGroupEnabled === true) lines.push('· 退群：/退群 确认（慎用，退出后不会自动回来）')
    }
  }
  if (bridge.config.adminEnabled && isAdmin && (bridge.broadcast || bridge.webhook)) {
    lines.push('· 播报：/播报 看定时任务与 webhook 状态 · /播报 测试 <任务 id> 立即发一次')
  }
  if (bridge.engageOn('reactionStatsEnabled')) {
    lines.push('· 表情回应：/赞榜 看本会话被回应最多的消息 · /谁赞了 <消息ID>（或引用一条消息）看谁点的')
  }
  if (bridge.engageOn('sendLikeEnabled')) {
    lines.push(`· 点赞：/点赞 @某人（不给目标就给自己，一次 ${Math.max(1, Number(bridge.config.sendLikeTimes) || 10)} 个）`)
  }
  if (bridge.engageOn('pokeCommandEnabled') && bridge.config.adminEnabled && isAdmin) {
    lines.push('· 戳一戳：/戳 @某人（管理员，受每小时配额限制）')
  }
  if (bridge.config.groupOpsEnabled === true) {
    if (bridge.config.nativeSignEnabled === true && message.messageType === 'group') {
      lines.push('· 原生群打卡：/群打卡（QQ 的群签到，和本地「签到」积分玩法是两件事）')
    }
    if (bridge.config.opsReadEnabled !== false && message.messageType === 'group') {
      lines.push('· 群运营查询：/全体余量 · /禁言名单 · /群详细 · /入群通知 · /打卡名册 · /管理员名单')
    }
    if (bridge.config.opsKickEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 批量踢：/批量踢 @某人 @另一个人 …（管理员，需再发 /批量踢 确认）')
    }
    if (bridge.config.opsTodoEnabled === true && message.messageType === 'group') {
      lines.push('· 群待办：引用一条消息发 /待办 · /完成待办 · /取消待办')
    }
    if (bridge.config.opsFileEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 文件整理：/移动文件 <文件ID> <目标目录ID> · /重命名文件 <文件ID> <新名> · /删文件 <文件ID> · /新建文件夹 <名字>')
    }
    if (bridge.config.opsAlbumUploadEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 相册上传：引用一张图片发 /传图 <相册ID或名字>（/传图 @album_id 可直接指定 ID）')
    }
    if (bridge.config.opsProfileEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 群资料：/群名 <新群名> · /群备注 <新备注>')
    }
    if (bridge.config.opsPolicyEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 入群与发言策略：/群权限 相册=关 临时会话=关 新群聊=开 · /历史可见 开|关')
    }
    if (bridge.config.opsAdminEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 管理员：/设管理 @某人 · /撤管理 @某人')
    }
    if (bridge.config.opsInvitePolicyEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 邀请策略：/邀请策略 关闭|需审核|免审核|百人以下')
    }
    if (bridge.config.opsAddOptionEnabled === true && isAdmin && message.messageType === 'group') {
      lines.push('· 加群方式：/加群方式 1–5（4/5 还要写 问题=… 答案=…；NapCat 没给枚举，取值按 QQ 客户端为准）')
    }
    if (bridge.config.requestSyncEnabled === true && isAdmin) {
      lines.push('· 申请补拉：/申请（把离线期间错过的入群申请/邀请/可疑好友一起拉进待审队列）')
    }
    if (bridge.config.opsReportEnabled === true && message.messageType === 'group') {
      lines.push(`· 群运营周报：/周报（最近 ${Math.max(1, Number(bridge.config.opsReportDays) || 7)} 天，本地统计）`)
    }
  }
  if (bridge.config.antiRecallEnabled) {
    lines.push('· 防撤回：有人撤回消息会补发内容（可在配置里关闭）')
  }
  if (bridge.config.filterEnabled || bridge.config.floodEnabled) {
    lines.push('· 群规：敏感词与刷屏会被提醒/撤回/禁言')
  }
  if (bridge.config.verifyEnabled && bridge.config.adminEnabled && isAdmin) {
    lines.push('· 入群审批：/待审 看列表 · /同意 序号 · /拒绝 序号 · /同意 all')
  }
  await bridge.safeReply(message, lines.join('\n'))
}
