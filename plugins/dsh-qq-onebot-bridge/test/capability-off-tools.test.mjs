import test from 'node:test'
import assert from 'node:assert/strict'
import { capabilityOffTools } from '../lib/services/capability-off-tools.js'

test('默认不拿掉任何工具', () => {
  assert.deepEqual(capabilityOffTools({ config: {}, surface: {}, exists: () => false }), [])
})

test('全局开关：图片/文件/语音/表情/资料/空间/读写/命令', () => {
  const out = capabilityOffTools({
    config: {
      imageSendEnabled: false, fileSendEnabled: false, voiceSendEnabled: false,
      faceToolsEnabled: false, selfProfileEnabled: false, qzoneEnabled: false,
      fsReadEnabled: false, fsWriteEnabled: false, shellEnabled: false,
    },
    surface: {},
    exists: () => false,
  })
  for (const name of ['qq_send_image', 'qq_send_file', 'qq_send_voice', 'qq_face_send', 'qq_face_qq_list', 'qq_set_nickname', 'qq_post_qzone', 'read', 'write', 'bash']) {
    assert.equal(out.includes(name), true, name)
  }
})

test('每用户覆盖：只拿掉该用户的', () => {
  const out = capabilityOffTools({
    config: { perUserPermsFile: 'p.json', imageSendEnabled: true },
    surface: { subject: 'u:42' },
    exists: () => true,
    readFile: () => '\uFEFF' + JSON.stringify({ 42: { image: false, fsRead: false } }),
  })
  assert.deepEqual(out.sort(), ['glob', 'grep', 'qq_send_image', 'read'].sort())
})

test('坏 JSON 只按全局', () => {
  const out = capabilityOffTools({
    config: { perUserPermsFile: 'p.json', shellEnabled: false },
    surface: { subject: 'u:1' },
    exists: () => true,
    readFile: () => 'not json',
  })
  assert.equal(out.includes('bash'), true)
})
