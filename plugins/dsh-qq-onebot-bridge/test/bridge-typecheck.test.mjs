import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const tscBin = process.env.DSH_TSC_BIN || 'D:/DSH/qqbot/tools/tsc/node_modules/typescript/bin/tsc'
const baselineFile = join(root, 'typecheck-bridge-baseline.json')
const config = join(root, 'tsconfig.bridge.json')

test('bridge.js typecheck 错误数不超过基线', { skip: !existsSync(tscBin) && '本机未安装 tsc' }, () => {
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')).count
  const result = spawnSync(process.execPath, [tscBin, '-p', config, '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (/Debug Failure|Error: .*tsc\.js/i.test(output)) {
    assert.fail(`tsc 崩溃（不是普通类型错误）：\n${output.slice(0, 2000)}`)
  }
  const errors = output.split(/\r?\n/).filter((line) => /: error TS\d+/.test(line))
  assert.ok(
    errors.length <= baseline,
    `tsc 错误数增加：${errors.length} > ${baseline}\n${errors.slice(0, 10).join('\n')}`,
  )
})
