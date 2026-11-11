import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContactsSection } from '../lib/services/contacts-section.js'

test('空白名单返回 null', () => {
  assert.equal(buildContactsSection({ config: {}, contacts: {}, ownerQQ: 1 }), null)
})

test('用户标签：备注 > 主人 > 管理员 > 朋友', () => {
  const built = buildContactsSection({
    config: { allowUsers: [1, 2, 3], adminUsers: [2], allowGroups: [9] },
    contacts: { 3: { note: '同事' }, 9: { note: '项目群' } },
    ownerQQ: 1,
  })
  assert.match(built.text, /主人（1）/)
  assert.match(built.text, /主人信任的人（2）/)
  assert.match(built.text, /同事（3）/)
  assert.match(built.text, /群 9（项目群）/)
  assert.equal(built.count, 4)
})

test('群没有备注时用“群聊”', () => {
  const built = buildContactsSection({ config: { allowGroups: [9] }, contacts: {}, ownerQQ: 1 })
  assert.match(built.text, /群 9（群聊）/)
})

test('文本包含隐私规则', () => {
  const built = buildContactsSection({ config: { allowUsers: [1] }, contacts: {}, ownerQQ: 1 })
  assert.match(built.text, /qq_list_chats/)
  assert.match(built.text, /不要把某个人的话转述给另一个人/)
  assert.equal(built.count, 1)
})
