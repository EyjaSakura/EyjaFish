import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { debugLog, setDebugLogPath } from '../lib/core/debug-log.js'

test('加载期日志在设置路径后补写，后续追加', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'))
  const file = join(dir, 'debug.log')
  debugLog('before-path')
  setDebugLogPath(file)
  debugLog('after-path')
  const text = readFileSync(file, 'utf8')
  assert.match(text, /before-path/)
  assert.match(text, /after-path/)
})

test('空路径不写文件、不抛', () => {
  setDebugLogPath('')
  assert.doesNotThrow(() => debugLog('no-path'))
})
