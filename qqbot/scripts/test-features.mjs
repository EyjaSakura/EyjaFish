#!/usr/bin/env node
// Discover and run feature-local tests: features/<name>/test/*.test.mjs
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve('D:/DSH/plugins/features')
const files = []
for (const name of readdirSync(root)) {
  const testDir = join(root, name, 'test')
  let entries = []
  try { entries = readdirSync(testDir) } catch { continue }
  for (const entry of entries) {
    if (!entry.endsWith('.test.mjs')) continue
    const file = join(testDir, entry)
    if (statSync(file).isFile()) files.push(file)
  }
}

if (files.length === 0) {
  console.log('no feature tests')
  process.exit(0)
}

const coverage = process.argv.includes('--coverage')
console.log(`feature tests: ${files.length}${coverage ? ' (coverage)' : ''}`)
const args = ['--test']
if (coverage) {
  args.push(
    '--experimental-test-coverage',
    '--test-coverage-include=features/**',
    '--test-coverage-lines=27',
    '--test-coverage-branches=50',
    '--test-coverage-functions=20',
  )
}
args.push(...files)
const result = spawnSync(process.execPath, args, {
  cwd: 'D:/DSH/plugins',
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
