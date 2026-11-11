// 自动抽取自 bridge.js #installSession
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

export async function installSession({ agentCtx, route, key, opts, bridge, defineTool, debugLog }) {
  const { resumed = false, role = bridge.roleOf(route), surface = null } = opts || {}
  // 工具面在本函数开头算一次：人格注入、工具裁剪、scoped 注册都用它
  const toolSurface = surface ?? bridge.toolSurface(route)
  try { // [gv2] 白名单访客补注册语音工具
    const __uid2 = String(key || '').replace(/^u:/, '')
    const __owner2 = String(bridge.ownerQQ())
    const __allow2 = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String)
    debugLog('[gv2] key=' + String(key) + ' uid=' + __uid2 + ' owner=' + __owner2 + ' allow=' + __allow2.join(',')) // [gv2]
    if (__uid2 && __uid2 !== __owner2 && __allow2.includes(__uid2) && typeof agentCtx.tools?.register === 'function') {
      const __b = this
      agentCtx.tools.register(defineTool({
        name: 'qq_send_voice',
        description: '把文字用 TTS 合成语音并发到当前聊天。',
        parameters: { text: { type: 'string', description: '要念的文字（不超过 ttsMaxChars）' } },
        output: { schema: { type: 'object', additionalProperties: false, properties: { sent: { type: 'boolean' }, detail: { type: 'string' } } }, render: (_a, v) => [{ type: 'text', text: v.detail }] },
        async execute(args) {
          const t = String(args.text ?? '').trim()
          if (!t) throw new Error('没有要念的文字')
          const d = await bridge.sendVoiceTo(route, t)
          return { sent: true, detail: d }
        },
      }))
      agentCtx.__gv2Voice = true // [gv2-dedup]
      debugLog('[gv2] registered for ' + __uid2) // [gv2]
    }
  } catch (e) { debugLog('[gv2] failed: ' + e.message) }
  // [tool-timeout-off] 包装已移除：会触发 inactive context 错误
  const chatScope = route.messageType === 'group'
    ? ` You are chatting in QQ group ${route.targetId}; everyone in this group shares this one conversation with you, so keep it coherent across members.`
    : ` You are in a private QQ chat with user ${route.targetId}; this conversation is isolated to that user and unrelated to any group chat.`
  const imageGuide = bridge.config.visionMode === 'native'
    ? 'Images the user sends or quotes are attached natively to the user message; view them directly as part of the message.'
    : `Images the user sends or quotes are saved locally and can be viewed with the ${bridge.config.visionToolName} tool.`
  const mediaGuide = bridge.config.agentMediaToolsEnabled === false
    ? ''
    : ` You can also send local images/files or a voice message into this chat with the qq_send_image / qq_send_file / qq_send_voice tools, and withdraw your own recent messages with qq_recall. Files may only be sent from the allowed directories (${bridge.sendRoots(role).join(', ')}).`
  // 共享只读区（tool.fs.read:shared）：挂上了就告诉模型怎么寻址，免得它猜绝对路径
  const sharedNote = toolSurface.sharedRead === true
    ? `，以及共享只读区（用 shared/ 前缀寻址，例如 shared/群规.md）`
    : ''
  const guestGuide = role?.guest
    ? ` 【只读访客模式】本次会话没有 shell，不能写/改/删/执行任何东西，也不允许申请额外权限。你只能读取 ${role.cwd} 目录内的文件${sharedNote}（read / glob / grep 工具），该目录之外的路径一律被拒绝。你可以使用 web_search / web_fetch 联网搜索和读取公开网页，联网不受只读限制。不要声称你创建或修改了文件；如果用户要求写操作，直接说明当前是只读模式。`
    : ''
  const queryGuide = (bridge.config.historyQueryEnabled === false && bridge.config.memberQueryEnabled === false && bridge.config.reactToolEnabled === false)
    ? ''
    : ' Read-only helpers: qq_recent_history fetches the latest messages of this chat (use it when asked about earlier conversation),'
      + (bridge.config.memberQueryEnabled === false ? '' : ' qq_member_info looks up group members (group chats only),')
      + (bridge.config.reactToolEnabled === false ? '' : ' and qq_react attaches an emoji reaction to a message instead of sending one.')
  // [权限模型] 人格也按权限走：没有 persona.text 就不注入人格（以前这个权限点声明了但没接）
  if (bridge.personaEnabled() && (toolSurface.decisions?.['persona.text']?.allowed ?? true)) {
    bridge.registerPersonaSection(agentCtx, key, role)
  } else if (bridge.personaEnabled()) {
    debugLog(`persona skipped: ${key} 的主体 ${toolSurface.subject} 没有 persona.text 权限`)
  }
  // [权限模型] 语料注入（SPEC §6）：主体绑定 ∩ 角色白名单，没内容就不注册段落
  bridge.registerCorpusSection(agentCtx, key, toolSurface.subject)
  agentCtx.systemPrompt.section({
    name: 'qq-onebot-bridge',
    order: 118,
    text: 'The user is interacting with you through QQ (OneBot bridge). Your ordinary assistant text is delivered automatically as QQ messages. Keep replies concise and in the same language as the user. 【本地补丁】QQ 不渲染 Markdown：对外回复必须是纯文本，不要使用 **加粗**、# 标题、反引号代码块、Markdown 表格或 [文字](链接) 语法；需要列举时用短横线或“1. ”行首编号，命令/代码/路径直接贴原文即可。【本地补丁】如果一个问题你无法给出确定的回答（时效性信息、事实核验、最新数据、自己不确定的知识等），优先调用 web_search 联网搜索（必要时用 web_fetch 打开来源）后再尝试给出结论；联网搜索也不足以确定时，直接说明不确定或不知道，不要凭印象编造。' + chatScope + ' Each group and each private user has a separate conversation with you, so never mix up context between chats. When the user quotes (replies to) an earlier message, its content is prefixed with [引用] in the user turn. ' + imageGuide + mediaGuide + queryGuide + (bridge.config.sttEnabled ? ' When a user quotes (replies to) a voice message while mentioning you, the quoted voice is transcribed and provided in the user turn as 用户引用的语音转文字内容; treat it as the voice content, and if the user text is empty, reply with the transcription directly. Private voice messages are transcribed automatically and delivered as user text prefixed with [语音消息].' : '') + guestGuide,
  })
  // [sing-protocol] 让她自己学歌的结构，不用主人开口
  try {
    const singLibFile = 'D:\\DSH\\sing\\library\\library.json'
    const singLib = JSON.parse(readFileSync(singLibFile, 'utf8'))
    const pending = (singLib.songs || []).filter((s) => s && s.needs_sections).map((s) => s.title)
    agentCtx.systemPrompt.section({
      name: 'qq-sing-protocol',
      order: 1185,
      text: '【曲库状态协议】当用户问“会唱什么/哪些唱得不好/还有多少没学/现在有哪些”等曲库状态问题时，必须先调用 qq_sing_list（第一档 ready + 第二档 caution）、qq_sing_rejected（只列第二档音域警告）和 qq_sing_incoming（第三档）拿实时结果，再按工具返回回答；禁止凭历史对话记忆或上一轮数字回答。曲库会随发布/入库变化，每次都要重新查。第二档不是“不会唱”，而是“已经推理、可以唱，但音域/转调不友好，可能不好听”；被点到时先简短提醒，再照常唱。' +
        '【唱歌协议】曲库里的每首歌都应当带有段落标注（主歌/副歌/桥段）。当你要唱一首歌，或发现某首歌还没有段落、或段落明显不对时：先调用 qq_sing_lyrics 拿到带时间的歌词，自己判断主歌/副歌/桥段，再用 qq_sing_save_sections 保存，然后才唱。' +
        '发现 incoming 有新歌时，先用 qq_sing_incoming 看清单；qq_sing_ingest 现在只做本地分离 + F0 分析进入 staging，SVC 推理在周末云端批处理完成，完成后再学习结构。' +
        (pending.length ? (' 当前待学结构：' + pending.join('、') + '，请尽快学会（空闲时也可以做）。') : ''),
    })
  } catch (singErr) { debugLog('sing protocol section failed: ' + (singErr && singErr.message)) }

  if (!resumed) {
    const memoryLines = bridge.loadMemoryLines(key)
    if (memoryLines.length > 0) {
      agentCtx.systemPrompt.section({
        name: 'qq-persistent-memory',
        order: 119,
        text: 'The following lines are the recent conversation of this chat, kept across host restarts (earliest first). Treat them as the continuation context of this session:\n' + memoryLines.join('\n'),
      })
    }
  }
  // [权限模型] 会话工具面：宿主级工具用 restrict 白名单裁剪，桥接 scoped 工具按权限决定注册。
  // 这张"谁能用哪些插件能力"的表由 lib/tool-grants.js 从权限点推导，不再写死 role.guest。
  await bridge.applyToolSurface(agentCtx, route, key, role, toolSurface)
  bridge.registerSelfTools(agentCtx, route, key, role) // [self-tools]
  bridge.registerContactsSection(agentCtx, role) // [contacts]
  bridge.registerIdentitySection(agentCtx, role) // [friend-identity]
  bridge.registerIdentityTools(agentCtx, route, key, role) // [friend-identity]
  bridge.registerDouyinTools(agentCtx, route, key, role) // [douyin-plugin]
  bridge.registerPvzTools(agentCtx, route, key, role) // [pvz-plugin]
  bridge.registerArkTools(agentCtx, route, key, role) // [ark-plugin]
  bridge.registerOwnerTools(agentCtx, route, key, role) // [contacts]
}
