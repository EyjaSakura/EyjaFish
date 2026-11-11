import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIdentityConfig } from '../lib/core/identity-config.js'

const pathOf = (_cfg, key) => `ROOT/${key}`
const subjectDir = (_cfg, subject) => `SUB/${subject}`
const normalizeRoleId = (id) => (String(id) === 'owner' || String(id) === 'admin' ? 'admin' : 'guest')

function build(config = {}) {
  return buildIdentityConfig({ config, pathOf, subjectDir, normalizeRoleId, env: { USER: 'tester' } })
}

test('identity 关闭：所有人 owner', () => {
  const id = build({})
  assert.equal(id.roleFor({ messageType: 'private', userId: 5 }).id, 'owner')
})

test('ownerQq 恒为 owner', () => {
  const id = build({ identity: { enabled: true }, ownerQq: '1' })
  assert.equal(id.roleFor({ messageType: 'group', groupId: 9, userId: 1 }).id, 'owner')
})

test('map 显式 owner 生效，未知走 guest', () => {
  const id = build({ identity: { enabled: true, map: { 2: 'owner' }, defaultRole: 'guest' } })
  assert.equal(id.roleFor({ messageType: 'private', userId: 2 }).id, 'owner')
  const g = id.roleFor({ messageType: 'private', userId: 3 })
  assert.equal(g.id, 'guest')
  assert.equal(g.cwd, 'SUB/user:3')
  assert.equal(g.subjectId, 'user:3')
})

test('perSubjectDirs=false 共用 guest 目录', () => {
  const id = build({ identity: { enabled: true, perSubjectDirs: false, roles: { guest: { cwd: 'SHARED' } } } })
  const g = id.roleFor({ messageType: 'private', userId: 3 })
  assert.equal(g.cwd, 'SHARED')
  assert.equal(g.subjectId, undefined)
})

test('groupRoles 按群升级，未知角色 fail-closed', () => {
  const id = build({ identity: { enabled: true, groupRoles: { 10: 'owner', 11: 'wat' }, groupRole: 'guest' } })
  assert.equal(id.roleFor({ messageType: 'group', groupId: 10, userId: 5 }).id, 'owner')
  assert.equal(id.roleFor({ messageType: 'group', groupId: 11, userId: 5 }).id, 'guest')
})

test('默认 groupRole / defaultRole 生效', () => {
  const id = build({ identity: { enabled: true, groupRole: 'owner', defaultRole: 'owner' } })
  assert.equal(id.roleFor({ messageType: 'group', groupId: 1, userId: 5 }).id, 'owner')
  assert.equal(id.roleFor({ messageType: 'private', userId: 5 }).id, 'owner')
})

test('owner 默认 preset/cwd/权限来自 config', () => {
  const id = build({ permissionPreset: 'danger', cwd: 'C:/o', fileSendDirs: ['D:/s'] })
  assert.equal(id.owner.preset, 'qq-coding')
  assert.equal(id.owner.permission, 'danger')
  assert.equal(id.owner.cwd, 'C:/o')
  assert.deepEqual(id.owner.sendExtraDirs, ['D:/s'])
})
