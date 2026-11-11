import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceProjectKey } from '../lib/core/workspace-key.js'

test('Windows 路径：分隔符折叠成 -', () => {
  const key = workspaceProjectKey('D:\\DSH\\qqbot')
  assert.match(key, /^--D-DSH-qqbot--$/)
})

test('连续分隔符只留一个', () => {
  assert.equal(workspaceProjectKey('D:\\\\DSH///qqbot'), '--D-DSH-qqbot--')
})

test('非 ASCII 用 ~XXXX 转义', () => {
  const key = workspaceProjectKey('D:/项目')
  assert.match(key, /~[0-9A-F]{4}/)
})

test('空路径回退 root，长度不超过 255', () => {
  assert.equal(workspaceProjectKey(''), '--root--')
  const long = workspaceProjectKey('D:/' + 'a'.repeat(500))
  assert.ok(long.length <= 255)
})
