import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'

test('contacts：hooks 暴露 identity/owner/query 注册器', () => {
  assert.deepEqual(Object.keys(hooks).sort(), ['registerIdentityTools', 'registerOwnerTools', 'registerQueryTools'])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})
