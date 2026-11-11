import test from 'node:test'
import assert from 'node:assert/strict'

import { hooks } from '../index.js'

test('voice：hooks 暴露朗读/TTS/合成/语音消息', () => {
  assert.deepEqual(Object.keys(hooks).sort(), ['handleVoice', 'handleVoiceReading', 'sendTts', 'synthVoiceFile'])
  assert.ok(Object.values(hooks).every((fn) => typeof fn === 'function'))
})
