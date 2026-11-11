# 测试与门禁

## 分层

| 层 | 位置 | 说明 |
|---|---|---|
| 纯逻辑单测 | `test/*.test.mjs` | core / services / tools，注入依赖，不碰 QQ |
| 协议 / WS | `test/onebot-server.test.mjs` 等 | 本地 WebSocket，验证 OneBot 收发 |
| fake-agent 回路 | `test/agent-loop-e2e.test.mjs` | handoff → fake followup → replyTo → 真实 OneBotServer WS，**不调用真实模型** |
| feature 合同 | `test/bridge-api-contract.test.mjs` | 扫描 features / message-pipeline / reply-router 的 `bridge.*` 调用，缺公开方法直接失败 |
| feature 单测 | `features/<name>/test/*.test.mjs` | 每个 feature 自己的工具/命令逻辑，`scripts/test-features.mjs` 统一跑 |
| private 字段 | `test/bridge-private-fields.test.mjs` | 所有 `this.#x` 必须有类内声明 |
| 部署 smoke | `scripts/deploy-smoke.ps1` | 临时目录打包 → 改文件 → 回滚 → 断言恢复 |

当前 `test:new` 共 **175 项**；bridge core **14 项**（`npm run test:bridge`）；feature 单测 **20 项**（`scripts/test-features.mjs --coverage`；覆盖率 20.14 / 45.45 / 9.59）。

## CI

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\ci.ps1
```

包含：

- `npm audit` 等价检查（本地离线口径）
- ESLint no-undef
- bridge 行数预算（只降不升）
- core/services no-undef + no-unused-vars
- bridge no-unused-vars
- typecheck core+services（基线 0，全绿）
- typecheck bridge（基线 0，全绿）
- typecheck features（基线 0，全绿）
- 覆盖率 core+services（97 / 82 / 79）
- 覆盖率 all-lib（80 / 73 / 70；当前 84.73 / 75.30 / 72.34）
- 部署 smoke
- 语法检查

## 覆盖率口径

- `core+services`：只统计 `lib/core` 与 `lib/services`
- `all-lib`：`lib/**`，排除 `lib/bridge.js`
- `bridge.js`：`npm run test:bridge` 通过 `test/host-loader.mjs` 把宿主包换成桩，真实统计核心类
  - 当前基线：行 55.43 / 分支 73.33 / 函数 3.31
  - CI 阈值：57 / 83 / 10（只升不降）

bridge 当前门禁：

- 行数预算
- typecheck 基线
- no-undef
- 公开 API 冻结 + 下游调用图
- 核心覆盖率基线
- no-unused-vars

## 真实 agent e2e 的边界

现有 e2e 的边界在 `agent-loop-e2e.test.mjs`：

- 真：OneBotServer 的 WebSocket、消息解析、`replyTo` 出站
- 假：agent 回合（fake followup）

要跨到真实模型回合，需要：

1. 起真实宿主 agent 进程；
2. 用测试 QQ / 注入帧触发一轮；
3. 断言回复或工具调用。

这会引入模型成本和非确定性，建议单独 nightly，不进每次 CI。

已实际跑通一次 dry-run 真实回合（2026-11-11，turn 37）：

```text
injection consumed=1
trace stage=agent 61 events
模型回复被 dry-run 拦截：ok
QQ 出站：0
```

也已跑通一次真实发送（2026-11-11，turn 39）：

```text
injectDryRun=false
注入 → 真实 agent → 模型回复 ok
trace stage=reply target=private:1815442184 chars=2
目标：owner QQ（仅测试）
```

因此“真实 DSH agent 回合 + 真实模型 + 真实 QQ 出站”已验证；仍未覆盖多步工具循环与 nightly。

注意：此前注入回合的模型回复被**无条件**拦截，即使 `injectDryRun=false`；本轮已修正为只有 `injectDryRun !== false` 才拦截。

已提供手动/nightly 入口：

```powershell
powershell -File D:\DSH\qqbot\scripts\e2e-real-agent.ps1 -Text "e2e ping"
```

它会：

1. 检查 runtime snapshot 的 `injection.enabled`
2. 默认要求 `injectDryRun=true`（模型真跑，但不向 QQ 真发）
3. 写入注入帧，等待 `injection.consumed` 增加
4. 检查 trace 是否出现 `stage=agent`

如果 `injection.enabled=false`，脚本会退出并提示先打开配置；当前默认关闭，属于明确边界，不是失败。

真实发送必须显式确认：

```powershell
# 先只打印计划，不发
powershell -File D:\DSH\qqbot\scripts\e2e-real-send.ps1 -UserId <测试QQ> -Text "test"

# 真发
powershell -File D:\DSH\qqbot\scripts\e2e-real-send.ps1 -UserId <测试QQ> -Text "test" -ConfirmRealSend
```

前提：

```text
runtime injection.enabled=true
runtime injection.dryRun=false
目标必须是测试 QQ / 测试群
```

不要对主群或陌生号使用 `-ConfirmRealSend`。

## 新增测试的建议

- 纯逻辑：放 `lib/core` 或 `lib/services`，导出函数，测试直接 import
- 有副作用：依赖通过参数注入（fs / exec / server / fetch），测试传 fake
- bridge 只保留接线；如果一段逻辑需要测，先抽到 service
