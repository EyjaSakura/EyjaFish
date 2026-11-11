// 防止 bridge.js 继续变大：行数不得超过预算（只降不升）。
import { readFileSync } from 'node:fs'

const BRIDGE = 'D:\\DSH\\plugins\\dsh-qq-onebot-bridge\\lib\\bridge.js'
const BUDGET = 'D:\\DSH\\plugins\\dsh-qq-onebot-bridge\\bridge-size-budget.json'

// 统一口径：只统计非空行，与 test/bridge-size.test.mjs 一致。
const lines = readFileSync(BRIDGE, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '').length
const budget = JSON.parse(readFileSync(BUDGET, 'utf8').replace(/^\uFEFF/, '')).lines
console.log(`bridge non-empty lines: ${lines} (budget ${budget})`)
if (lines > budget) {
  console.error('BRIDGE SIZE FAILED: 拆分只降不升；新功能请放到 service/feature')
  process.exit(1)
}
if (lines < budget) {
  console.log(`BRIDGE SIZE OK（低于预算，可把 bridge-size-budget.json 下调到 ${lines}）`)
} else {
  console.log('BRIDGE SIZE OK')
}
