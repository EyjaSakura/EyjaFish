import test from 'node:test'
import assert from 'node:assert/strict'
import { registerSelfTools } from '../../features/self/index.js'

const EXPECTED = [
  'qq_set_nickname', 'qq_set_signature', 'qq_set_avatar', 'qq_post_qzone',
  'qq_hot_bili', 'qq_hot_douyin', 'bili_get_profile', 'bili_set_nickname',
  'bili_set_signature', 'bili_set_avatar', 'qq_bili_subtitle', 'qq_bili_video',
  'qq_face_qq_list', 'qq_face_qq_autotag', 'qq_face_qq_send', 'qq_face_prune',
  'qq_face_tag', 'qq_face_send_to', 'qq_face_delete', 'qq_face_last', 'qq_face_save_qq',
  'qq_download_image', 'qq_qzone_daily_diary', 'qq_qzone_list', 'qq_qzone_reply_comment',
  'qq_qzone_delete_comment', 'qq_qzone_comment', 'qq_qzone_posts', 'qq_delete_qzone',
]

test('self 插件拆分后仍注册 29 个工具', () => {
  const names = []
  const agentCtx = { tools: { register: (def) => { names.push(def.name) } } }
  const bridge = {
    config: { adminUsers: ['10001'] },
    server: { currentSocket: () => null, action: async () => ({}) },
  }
  registerSelfTools({
    agentCtx,
    route: { targetId: 10001 },
    key: 'u:10001',
    role: { subjectId: 'u:10001' },
    bridge,
    defineTool: (def) => def,
    debugLog: () => {},
  })
  assert.equal(names.length, 29)
  assert.deepEqual([...names].sort(), [...EXPECTED].sort())
})
