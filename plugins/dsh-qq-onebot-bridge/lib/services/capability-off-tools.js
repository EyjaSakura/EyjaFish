// 按全局开关 + 每用户覆盖，算出应被拿掉的工具名。
/** @param {any} args */
export function capabilityOffTools({ config = {}, surface, exists, readFile }) {
  const out = new Set()
  if (config.imageSendEnabled === false) out.add('qq_send_image')
  if (config.fileSendEnabled === false) out.add('qq_send_file')
  if (config.voiceSendEnabled === false) out.add('qq_send_voice')
  if (config.faceToolsEnabled === false) { out.add('qq_face_list'); out.add('qq_face_send') }
  if (config.faceToolsEnabled === false) { for (const n of ['qq_face_qq_list', 'qq_face_qq_send', 'qq_face_qq_delete', 'qq_face_qq_tag', 'qq_face_save_qq', 'qq_face_last', 'qq_face_tag', 'qq_face_prune']) out.add(n) }
  if (config.selfProfileEnabled === false) { out.add('qq_set_nickname'); out.add('qq_set_signature'); out.add('qq_set_avatar') }
  if (config.qzoneEnabled === false) { out.add('qq_post_qzone'); out.add('qq_delete_qzone') }
  if (config.fsWriteEnabled === false) out.add('qq_download_image')
  if (config.fsReadEnabled === false) { out.add('read'); out.add('glob'); out.add('grep') }
  if (config.fsWriteEnabled === false) { out.add('write'); out.add('edit'); out.add('apply_patch'); out.add('str_replace_editor') }
  if (config.shellEnabled === false) { out.add('bash'); out.add('pwsh'); out.add('terminal'); out.add('run_command'); out.add('shell') }
  try {
    const file = config.perUserPermsFile
    if (file && exists(file)) {
      const all = JSON.parse(readFile(file).replace(/^\uFEFF/, ''))
      const uid = String(surface?.subject || '').replace(/^(?:u|user):/, '')
      const p = all[uid] || {}
      if (p.image === false) out.add('qq_send_image')
      if (p.file === false) out.add('qq_send_file')
      if (p.voice === false) out.add('qq_send_voice')
      if (p.faces === false) { out.add('qq_face_list'); out.add('qq_face_send') }
      if (p.fsRead === false) { out.add('read'); out.add('glob'); out.add('grep') }
      if (p.fsWrite === false) { out.add('write'); out.add('edit'); out.add('apply_patch'); out.add('str_replace_editor') }
      if (p.shell === false) { out.add('bash'); out.add('pwsh'); out.add('terminal'); out.add('run_command'); out.add('shell') }
    }
  } catch { /* 读不到就只按全局 */ }
  return [...out]
}
