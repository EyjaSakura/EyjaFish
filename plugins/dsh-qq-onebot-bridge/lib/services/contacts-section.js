// 根据白名单生成"你认识的人"系统提示段。
/** @param {any} args */
export function buildContactsSection({ config = {}, contacts = {}, ownerQQ }) {
  const admins = new Set((config.adminUsers ?? []).map(String))
  const users = [...new Set([...(config.allowUsers ?? []), ...(config.adminUsers ?? [])].map(String))]
  const groups = [...new Set((config.allowGroups ?? []).map(String))]
  if (users.length === 0 && groups.length === 0) return null
  const label = (id) => {
    const note = (contacts[id] && contacts[id].note) || ''
    if (note) return note
    if (String(id) === String(ownerQQ)) return '主人'
    if (admins.has(id)) return '主人信任的人'
    return '朋友'
  }
  const lines = [
    ...users.map((id) => '- ' + label(id) + '（' + id + '）'),
    ...groups.map((g) => '- 群 ' + g + '（' + ((contacts[g] && contacts[g].note) || '群聊') + '）'),
  ]
  const text = [
    '你认识的人（从白名单自动生成，会随名单变化；他们各自和你单独聊天，是同一个人格的不同窗口）：',
    ...lines,
    '',
    '规则：',
    '1. 你知道自己在和谁说话；同一个人可能用多个号找你，不要把他们当成不同的人区别对待。',
    '2. 不要把某个人的话转述给另一个人，也不要在 A 的窗口里复述 B 的对话内容。',
    '3. **只要主人问起“你在和谁聊天 / 有没有别人找你 / 和别人聊了什么”，必须先调用 qq_list_chats（问聊了什么再加 qq_chat_digest）再回答**；禁止凭印象说“就你一个”。',
    '4. 别人问同类问题，一律回答“这个只跟主人说”，不要调用工具。',
    '5. 名单是自动的：新加的人会自动出现在这里，你不需要记，也不要编造没出现在名单里的人。',
    '6. **除非主人明确问起，否则不要主动提别的窗口、名单里的其他人、或别人和你聊了什么**；平时就当这个窗口只有当前这一个人。',
  ].join('\n')
  return { text, count: users.length + groups.length }
}
