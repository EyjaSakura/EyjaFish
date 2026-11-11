// 实时权限：根据全局开关 + 每用户覆盖，拦下被关闭的工具。
const READ_TOOLS = ['read', 'glob', 'grep', 'list_dir', 'ls']
const WRITE_TOOLS = ['write', 'edit', 'apply_patch', 'str_replace_editor', 'multi_edit']
const SHELL_TOOLS = ['bash', 'pwsh', 'terminal', 'run_command', 'shell', 'execute_command']

/** @param {any} args */
export function liveCapabilityBlock({ config = {}, surface, exec, exists, readFile, debugLog = () => {} }) {
  const name = String(exec?.name ?? '')
  if (name === '') return undefined
  const uid = String(surface?.subject || '').replace(/^(?:u|user):/, '')
  let p = {}
  try {
    const file = config.perUserPermsFile
    if (file && exists(file)) {
      const all = JSON.parse(readFile(file).replace(/^\uFEFF/, ''))
      p = all[uid] || {}
    }
  } catch { p = {} }
  const off = (globalOn, perUser) => globalOn === false || perUser === false
  let blocked = false
  let cap = ''
  if (name === 'qq_send_image') { blocked = off(config.imageSendEnabled, p.image); cap = '发图片' }
  else if (name === 'qq_send_file') { blocked = off(config.fileSendEnabled, p.file); cap = '发文件' }
  else if (name === 'qq_send_voice') { blocked = off(config.voiceSendEnabled, p.voice); cap = '发语音' }
  else if (name === 'qq_face_list' || name === 'qq_face_send') { blocked = off(config.faceToolsEnabled, p.faces); cap = '表情包' }
  else if (name === 'qq_set_nickname' || name === 'qq_set_signature' || name === 'qq_set_avatar') { blocked = off(config.selfProfileEnabled, p.profile); cap = '改资料' }
  else if (name === 'qq_post_qzone' || name === 'qq_delete_qzone') { blocked = off(config.qzoneEnabled, p.qzone); cap = 'QQ空间' }
  else if (READ_TOOLS.includes(name)) { blocked = off(config.fsReadEnabled, p.fsRead); cap = '读文件' }
  else if (WRITE_TOOLS.includes(name)) { blocked = off(config.fsWriteEnabled, p.fsWrite); cap = '写文件' }
  else if (SHELL_TOOLS.includes(name)) { blocked = off(config.shellEnabled, p.shell); cap = '执行命令' }
  if (!blocked) return undefined
  debugLog(`[live-perms] blocked ${name} (cap=${cap} subject=${surface?.subject})`)
  return `权限不足：「${cap}」已被管理员关闭（账号 ${uid}）`
}
