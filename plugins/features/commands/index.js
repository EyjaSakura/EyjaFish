// 命令功能插件：运维命令 / 互动命令 / 帮助 / 管理命令
import { handleOpsCommand } from './ops.js'
import { handleEngageCommand } from './engage.js'
import { handleHelp } from './help.js'
import { handleAdminCommand } from './admin.js'
import { registerReminderTools } from './reminder-tools.js'
import { registerWorklogTools } from './worklog-tools.js'

export const hooks = { handleOpsCommand, handleEngageCommand, handleHelp, handleAdminCommand, registerReminderTools, registerWorklogTools }