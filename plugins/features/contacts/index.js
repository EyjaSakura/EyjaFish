// 联系人/身份功能插件：identity / owner / query
import { registerIdentityTools } from './identity.js'
import { registerOwnerTools } from './owner.js'
import { registerQueryTools } from './query.js'

export const hooks = { registerIdentityTools, registerOwnerTools, registerQueryTools }
