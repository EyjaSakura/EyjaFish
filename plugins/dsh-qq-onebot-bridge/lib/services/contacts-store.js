// 联系人单一事实源：读 contacts.json，读不到回退内置三人；并生成“当前对话对象”行。

export const DEFAULT_CONTACTS = {
  1815442184: { name: '主人', gender: 'male', role: 'owner' },
  2930661826: { name: '倩倩姐', gender: 'female', role: 'friend' },
  3355373151: { name: '珊姐姐', gender: 'female', role: 'friend' },
}

/** @param {any} args */
export function readContacts({ file, fallback = DEFAULT_CONTACTS, exists, readFile, debugLog = () => {} }) {
  let all = null
  try {
    if (exists(file)) all = JSON.parse(readFile(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    debugLog('[self-state] contacts read failed: ' + error.message)
  }
  if (!all || typeof all !== 'object' || Array.isArray(all) || !Object.keys(all).length) all = fallback
  return { all, count: Math.max(1, Object.keys(all).length) }
}

export function contactLine(chatKey, all) {
  const m = String(chatKey || '').match(/(\d{5,})/)
  if (!m) return ''
  const c = all?.[m[1]]
  if (!c) return ''
  const g = c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : ''
  const role = c.role === 'owner' ? '主人' : '朋友'
  const name = String(c.name || m[1]).slice(0, 20)
  return '【当前对话对象】' + name + '（' + (g ? g + '，' : '') + role + '）'
}
