// 自动抽取自 bridge.js #applyToolSurface
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
import { TOOL_GRANTS, allowedToolNames, explainToolSurface, resolveToolSurface } from './tool-grants.js'

export async function applyToolSurface({ agentCtx, route, key, role, surface, bridge, defineTool, debugLog }) {
  const tools = agentCtx?.tools
  if (surface.needRestrict) {
    // ① 先尽量用 restrict 把那批**全局**工具直接隐藏掉。
    //    注意真机实测：白名单里只要有一个"不是全局工具"的名字（read/glob/grep 是 preset 层、
    //    web_search 是桥接 scoped 注册），restrict 会整段抛错，于是裁剪完全不生效 ——
    //    所以失败时回落到 `{allow: []}`（把可限制的全局工具全挡掉），并**把原因写进 debug 日志**
    //    （以前只写 logger.warn，桥接日志里根本看不到，漏了整整一天）。
    let restrictNote = ''
    if (typeof tools?.restrict === 'function') {
      // [restrict-filter] 只保留本版本真实存在的全局工具名，避免整段被拒后回落 allow=[]
      const KNOWN_GLOBAL = new Set(['ask_user_question', 'create_goal', 'edit', 'exit_plan_mode', 'get_goal',
        'glob', 'grep', 'interrupt_agent', 'job_kill', 'job_list', 'job_output', 'list_agents',
        'present', 'pwsh', 'read', 'read_image', 'send_message', 'skill', 'subagent_fork', 'todo_write',
        'update_goal', 'web_fetch', 'web_search', 'workflow', 'working_directory', 'write'])
      const mappedAllow = [...new Set((surface.inheritedTools ?? []).map((n) => (n === 'bash' ? 'pwsh' : n)).filter((n) => KNOWN_GLOBAL.has(n)))]
      try {
        tools.restrict({ allow: mappedAllow })
        restrictNote = `restrict allow=[${mappedAllow.join(',')}] (原始 ${surface.inheritedTools.length} 项，过滤 ${surface.inheritedTools.length - mappedAllow.length} 项)`
      } catch (error) {
        try {
          tools.restrict({ allow: [] })
          restrictNote = `restrict allow=[${surface.inheritedTools.join(',')}] 不被接受（${error?.message ?? error}），已回落 allow=[]`
        } catch (error2) {
          restrictNote = `restrict 不可用（${error2?.message ?? error2}）`
        }
      }
    } else {
      restrictNote = 'tools.restrict 不存在'
    }
    debugLog(`tool surface ${key}: ${restrictNote} (${explainToolSurface(surface)})`)

    // ② 真正的兜底：注册 guard，**按允许集合拒绝执行**没授权的工具。
    //    restrict 只能挡全局工具（而且可能整段失败），guard 对任何层级都生效 ——
    //    宿主级插件注册进会话的 ecs / n8n / gh / session_read / context_handoff 就靠它挡住。
    const allowed = allowedToolNames(surface)
    // [granular] 细粒度开关：按能力剔除工具 / 权限点
    {
      const cfg = bridge.config || {}
      const dropTools = (names) => { for (const n of names) allowed.delete(n) }
      if (cfg.imageSendEnabled === false) dropTools(['qq_send_image'])
      if (cfg.fileSendEnabled === false) dropTools(['qq_send_file'])
      if (cfg.voiceSendEnabled === false) dropTools(['qq_send_voice'])
      if (cfg.faceToolsEnabled === false) dropTools(['qq_face_list', 'qq_face_send'])
      const denyPerm = (perm) => {
        for (const k of Object.keys(surface.decisions || {})) {
          if (k === perm || k.startsWith(`${perm}:`)) surface.decisions[k] = { allowed: false, reason: 'config: capability disabled' }
        }
      }
      if (cfg.fsReadEnabled === false) { denyPerm('tool.fs.read'); denyPerm('tool.fs.search') }
      if (cfg.fsWriteEnabled === false) denyPerm('tool.fs.write')
      if (cfg.shellEnabled === false) denyPerm('tool.shell')
      // [per-user] 按号覆盖：文件里显式 false 的能力对该主体关闭
      try {
        const file = cfg.perUserPermsFile
        if (file && existsSync(file)) {
          const all = JSON.parse(readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''))
          const uid = String(surface.subject || '').replace(/^(?:u|user):/, '')
          const p = all[uid] || {}
          if (p.image === false) allowed.delete('qq_send_image')
          if (p.file === false) allowed.delete('qq_send_file')
          if (p.voice === false) allowed.delete('qq_send_voice')
          if (p.faces === false) { allowed.delete('qq_face_list'); allowed.delete('qq_face_send') }
          if (p.fsRead === false) { denyPerm('tool.fs.read'); denyPerm('tool.fs.search') }
          if (p.fsWrite === false) denyPerm('tool.fs.write')
          if (p.shell === false) denyPerm('tool.shell')
        }
      } catch { /* 读不到就按全局开关走 */ }
    }
    let guardNote = ''
    if (typeof tools?.guard === 'function') {
      try {
        tools.guard((exec) => {
          const name = String(exec?.name ?? '')
          if (name === '') return undefined
          const live = bridge.liveCapabilityBlock(surface, exec) // [live-perms]
          if (live) return live
          // [owner-auto-allow] 扩展工具自动放行，默认只允许主人
          const __ownerAuto = /^(qq_face_|qq_hot_|qq_bili_|qq_qzone_|qq_set_|qq_post_|qq_send_(?:to_user|audio_to)$|qq_download_image$|qq_list_chats$|qq_chat_digest$|qq_report_identity$|bili_)/.test(name)
          if (name === 'qq_send_voice') { // [guest-voice-tool] 白名单好友可发语音（写权限由工具内部校验）
          const __u = String(surface.subject).replace(/^user:/, '')
          if ([...bridge.config.allowUsers ?? [], ...bridge.config.adminUsers ?? []].map(String).includes(__u)) return undefined
          return '不在白名单'
        }
        if (name === 'qq_quote_reply') return undefined // [quote-reply] 任何人都能引用回复
          if (name === 'qq_contact_taste') { if (String(surface.subject) !== 'user:' + bridge.ownerQQ()) return '这个工具目前只允许主人调用'; return undefined }
          if (name === 'douyin_analyze_video') { // [analyze-any]
            const __uid = String(surface.subject).replace(/^user:/, '')
            if ([...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? [])].map(String).includes(__uid)) return undefined
            return '不在白名单'
          }
          if (/^douyin_/.test(name)) { if (String(surface.subject) !== 'user:' + bridge.ownerQQ()) return '这个工具目前只允许主人调用'; return undefined }
          // [memory-tools-owner] 记忆检索只给主人
          if (/^memory_/.test(name)) {
            let __memOwner = ''
            try { __memOwner = String(bridge.ownerQQ() || '') } catch { __memOwner = '' }
            if (!__memOwner) __memOwner = '1815442184'
            const __memSubj = String(surface.subject)
            if (__memSubj === 'user:' + __memOwner || __memSubj === 'u:' + __memOwner) return undefined
            return '这个工具目前只允许主人调用'
          }
          // [sing-tools] 唱歌工具：主人 + 白名单可用
          // [sing-public] 点歌/列表/歌词/看待入库：所有联系人可用。
          if (name === 'qq_sing' || name === 'qq_sing_list' || name === 'qq_sing_lyrics' || name === 'qq_sing_incoming') return undefined
          // [sing-write] 标注段落/启动入库：仍只给主人 + 白名单。
          if (name === 'qq_sing_save_sections' || name === 'qq_sing_ingest' || name === 'qq_reminder_cancel' || name === 'qq_worklog') {
            const __singUid = String(surface.subject).replace(/^(?:u|user):/, '')
            let __singOwner = ''
            try { __singOwner = String(bridge.ownerQQ?.() ?? '') } catch { __singOwner = '' }
            const __singList = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? []), __singOwner].filter(Boolean).map(String)
            if (__singList.includes(__singUid)) return undefined
            return '唱歌写入操作只给白名单'
          }
          if (__ownerAuto) {
            if (bridge.capabilityOffTools(surface).includes(name)) return '权限不足：' + name + ' 已被关闭'
            if (String(surface.subject) !== 'user:' + bridge.ownerQQ() && String(surface.subject) !== 'u:' + bridge.ownerQQ()) return '这个工具目前只允许主人调用'
            return undefined
          }
          // [pvz-tools-guard] pvz_* 只给主人那个窗口用
          if (/^pvz_/.test(name)) {
            if (String(surface.subject) !== 'user:' + bridge.ownerQQ() && String(surface.subject) !== 'u:' + bridge.ownerQQ()) return '这个工具目前只允许主人调用'
            return undefined
          }
          // [maa-tools-guard] ark_* 只给主人窗口（#ownerQQ 取不到就退回配置里的主人号）
          if (/^ark_/.test(name)) {
            let __maaOwner = ''
            try { __maaOwner = String(bridge.ownerQQ() || '') } catch { __maaOwner = '' }
            if (!__maaOwner) __maaOwner = '1815442184'
            const __maaSubj = String(surface.subject)
            if (__maaSubj !== 'user:' + __maaOwner && __maaSubj !== 'u:' + __maaOwner) return '这个只有主人能让我做'
            return undefined
          }
          // [memory-tools-owner] 记忆检索只给主人
          if (/^memory_/.test(name)) {
            let __memOwner = ''
            try { __memOwner = String(bridge.ownerQQ() || '') } catch { __memOwner = '' }
            if (!__memOwner) __memOwner = '1815442184'
            const __memSubj = String(surface.subject)
            if (__memSubj === 'user:' + __memOwner || __memSubj === 'u:' + __memOwner) return undefined
            return '这个工具目前只允许主人调用'
          }
          // [sing-tools] 唱歌工具：主人 + 白名单可用
          // [sing-public] 点歌/列表/歌词/看待入库：所有联系人可用。
          if (name === 'qq_sing' || name === 'qq_sing_list' || name === 'qq_sing_lyrics' || name === 'qq_sing_incoming') return undefined
          // [sing-write] 标注段落/启动入库：仍只给主人 + 白名单。
          if (name === 'qq_sing_save_sections' || name === 'qq_sing_ingest' || name === 'qq_reminder_cancel' || name === 'qq_worklog') {
            const __singUid = String(surface.subject).replace(/^(?:u|user):/, '')
            let __singOwner = ''
            try { __singOwner = String(bridge.ownerQQ?.() ?? '') } catch { __singOwner = '' }
            const __singList = [...(bridge.config.allowUsers ?? []), ...(bridge.config.adminUsers ?? []), __singOwner].filter(Boolean).map(String)
            if (__singList.includes(__singUid)) return undefined
            return '唱歌写入操作只给白名单'
          }
          if (name === 'qq_usage_report') {
            let __usageOwner = ''
            try { __usageOwner = String(bridge.ownerQQ() || '') } catch { __usageOwner = '' }
            if (!__usageOwner) __usageOwner = '1815442184'
            const __usageSubj = String(surface.subject)
            if (__usageSubj === 'user:' + __usageOwner || __usageSubj === 'u:' + __usageOwner) return undefined
            return '用量报表只给主人看'
          }
          if (name === 'qq_draw') {
            if (bridge.drawAllowed(surface.subject)) return undefined
            return '生图只给主人和倩倩姐'
          }
          if (globalThis.__qqFeatureTools?.has?.(name)) {
            let __featOwner = ''
            try { __featOwner = String(bridge.ownerQQ() || '') } catch { __featOwner = '' }
            if (!__featOwner) __featOwner = '1815442184'
            const __featSubj = String(surface.subject)
            if (__featSubj === 'user:' + __featOwner || __featSubj === 'u:' + __featOwner) return undefined
            if (name === 'qq_draw' && bridge.drawAllowed(surface.subject)) return undefined
            return '这个插件工具目前只允许主人调用'
          }
          if (allowed.has(name)) return undefined
          return `权限不足：本会话（主体 ${surface.subject}）没有调用 ${name} 的权限`
        })
        guardNote = `guard 已注册（允许 ${allowed.size} 个工具名）`
      } catch (error) {
        guardNote = `guard 注册失败：${error?.message ?? error}`
      }
    } else {
      guardNote = 'tools.guard 不存在'
    }
    debugLog(`tool surface ${key}: ${guardNote}`)
    if (!surface.needRestrict && typeof tools?.guard === 'function') {
      try {
        tools.guard((exec) => bridge.liveCapabilityBlock(surface, exec)) // [live-perms]
        debugLog(`tool surface ${key}: live-perm guard 已注册`)
      } catch (error) {
        debugLog(`tool surface ${key}: live-perm guard 注册失败 ${error?.message ?? error}`)
      }
    }
    if (guardNote !== `guard 已注册（允许 ${allowed.size} 个工具名）`) {
      bridge.logger.warn(`[权限模型] ${key}: ${guardNote}；该会话的未授权工具只能靠 restrict（可能整段失效）`)
    }
  } else {
    debugLog(`tool surface ${key}: 不裁剪（该主体拥有全部工具权限）`)
    // [live-perms] admin 分支也必须装实时守卫：否则关掉的能力仍然可用
    try {
      const liveAllowed = allowedToolNames(surface)
      for (const n of bridge.capabilityOffTools(surface)) liveAllowed.delete(n)
      // [self-tools] 这些工具不在权限表里，需显式加入白名单（关掉时不加）
      {
        const offSelf = new Set(bridge.capabilityOffTools(surface))
        for (const n of ['qq_set_nickname', 'qq_set_signature', 'qq_set_avatar', 'qq_post_qzone', 'qq_delete_qzone', 'qq_download_image', 'qq_list_chats', 'qq_chat_digest', 'qq_set_friend_remark', 'qq_report_identity', 'qq_send_to_user', 'qq_send_audio_to', 'qq_face_save_qq', 'qq_face_last', 'qq_face_qq_list', 'qq_face_qq_send', 'qq_face_tag', 'qq_face_prune', 'qq_face_delete', 'qq_face_send_to', 'qq_hot_bili', 'qq_hot_douyin', 'qq_bili_video', 'qq_bili_subtitle', 'qq_recall', 'bili_set_nickname', 'bili_set_signature', 'bili_set_avatar', 'bili_get_profile', 'qq_qzone_posts', 'qq_qzone_list', 'qq_qzone_reply_comment', 'qq_qzone_comment', 'qq_qzone_delete_comment', 'qq_qzone_daily_diary']) {
          if (!offSelf.has(n)) liveAllowed.add(n)
        }
      }
      debugLog(`tool surface ${key}: memory in guard search=${liveAllowed.has('memory_search')} timeline=${liveAllowed.has('memory_timeline')}`)
      if (typeof tools?.guard === 'function') {
        tools.guard((exec) => {
          const name = String(exec?.name ?? '')
          if (name === '') return undefined
          const live = bridge.liveCapabilityBlock(surface, exec)
          if (live) return live
          // [owner-auto-allow] 扩展工具自动放行，默认只允许主人
          const __ownerAuto = /^(qq_face_|qq_hot_|qq_bili_|qq_qzone_|qq_set_|qq_post_|qq_send_(?:to_user|audio_to)$|qq_download_image$|qq_list_chats$|qq_chat_digest$|qq_report_identity$|bili_)/.test(name)
          if (name === 'qq_send_voice') { // [guest-voice-tool] 白名单好友可发语音（写权限由工具内部校验）
          const __u = String(surface.subject).replace(/^user:/, '')
          if ([...bridge.config.allowUsers ?? [], ...bridge.config.adminUsers ?? []].map(String).includes(__u)) return undefined
          return '不在白名单'
        }
        if (name === 'qq_quote_reply') return undefined // [quote-reply] 任何人都能引用回复
          if (name === 'qq_contact_taste') { if (String(surface.subject) !== 'user:' + bridge.ownerQQ()) return '这个工具目前只允许主人调用'; return undefined }
          if (/^douyin_/.test(name)) { if (String(surface.subject) !== 'user:' + bridge.ownerQQ()) return '这个工具目前只允许主人调用'; return undefined }
          if (__ownerAuto) {
            if (bridge.capabilityOffTools(surface).includes(name)) return '权限不足：' + name + ' 已被关闭'
            if (String(surface.subject) !== 'user:' + bridge.ownerQQ() && String(surface.subject) !== 'u:' + bridge.ownerQQ()) return '这个工具目前只允许主人调用'
            return undefined
          }
          // [maa-tools-guard3] dsh-maa-cli 的 maa_* 也放行给主人
          if (/^maa_/.test(name)) {
            let __maaOwner3 = ''
            try { __maaOwner3 = String(bridge.ownerQQ() || '') } catch { __maaOwner3 = '' }
            if (!__maaOwner3) __maaOwner3 = '1815442184'
            const __maaSubj3 = String(surface.subject)
            if (__maaSubj3 !== 'user:' + __maaOwner3 && __maaSubj3 !== 'u:' + __maaOwner3) return '这个只有主人能让我做'
            return undefined
          }
          // [maa-tools-guard2] admin 分支也要放行 ark_*（只给主人）
          if (/^ark_/.test(name)) {
            let __maaOwner2 = ''
            try { __maaOwner2 = String(bridge.ownerQQ() || '') } catch { __maaOwner2 = '' }
            if (!__maaOwner2) __maaOwner2 = '1815442184'
            const __maaSubj2 = String(surface.subject)
            if (__maaSubj2 !== 'user:' + __maaOwner2 && __maaSubj2 !== 'u:' + __maaOwner2) return '这个只有主人能让我做'
            return undefined
          }
          if (name === 'qq_usage_report') {
            let __usageOwner2 = ''
            try { __usageOwner2 = String(bridge.ownerQQ() || '') } catch { __usageOwner2 = '' }
            if (!__usageOwner2) __usageOwner2 = '1815442184'
            const __usageSubj2 = String(surface.subject)
            if (__usageSubj2 === 'user:' + __usageOwner2 || __usageSubj2 === 'u:' + __usageOwner2) return undefined
            return '用量报表只给主人看'
          }
          if (name === 'qq_draw') {
            if (bridge.drawAllowed(surface.subject)) return undefined
            return '生图只给主人和倩倩姐'
          }
          if (globalThis.__qqFeatureTools?.has?.(name)) {
            let __featOwner = ''
            try { __featOwner = String(bridge.ownerQQ() || '') } catch { __featOwner = '' }
            if (!__featOwner) __featOwner = '1815442184'
            const __featSubj = String(surface.subject)
            if (__featSubj === 'user:' + __featOwner || __featSubj === 'u:' + __featOwner) return undefined
            if (name === 'qq_draw' && bridge.drawAllowed(surface.subject)) return undefined
            return '这个插件工具目前只允许主人调用'
          }
          // [sing-admin] admin/owner 分支没有按白名单注册 sing 工具，但它是第一方能力，直接放行。
          if (/^qq_sing/.test(name) || name === 'qq_sing_list' || name === 'qq_sing_lyrics' ||
              name === 'qq_sing_save_sections' || name === 'qq_sing_incoming' || name === 'qq_sing_ingest' ||
              name === 'qq_reminder_cancel' || name === 'qq_worklog') return undefined
          if (liveAllowed.has(name)) return undefined
          return `权限不足：本会话（主体 ${surface.subject}）没有调用 ${name} 的权限`
        })
        debugLog(`tool surface ${key}: live guard 已注册（admin，允许 ${liveAllowed.size} 项）`)
      }
    } catch (error) {
      debugLog(`tool surface ${key}: live guard 失败 ${error?.message ?? error}`)
    }
  }

  if (surface.scoped.jailedFs) await bridge.registerJailedFsTools(agentCtx, role, key, surface)
  if (surface.scoped.web) await bridge.registerScopedWebTools(agentCtx, key)
  bridge.registerMemoryTools(agentCtx, key)
  bridge.registerSingTools(agentCtx, route, key)

  const allow = (perm) => surface.decisions?.[perm]?.allowed === true
  if (allow('tool.chat.faces') && bridge.config.faceEnabled) bridge.registerFaceTools(agentCtx, route)
  if (allow('tool.chat.media') && bridge.config.agentMediaToolsEnabled !== false) {
    bridge.registerMediaTools(agentCtx, route, key, role)
  }
  if (allow('tool.chat.members') || allow('tool.chat.history') || allow('tool.chat.react')) {
    bridge.registerQueryTools(agentCtx, route, key)
  }
  bridge.toolSurfaceSelfCheck(agentCtx, surface, key)
}
