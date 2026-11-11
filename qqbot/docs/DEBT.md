# 技术债登记

按“影响面 × 偿还成本”排序。每项必须有验收标准，避免“感觉还完了”。

## P1

### 1. `bridge.js` 行数目标已达成，覆盖率基线已建立

- 现状：997 非空行（2026-11-11），已 <1000
- 已迁出：49 个公开薄包装到 `lib/services/bridge-facade.js`，通过 `Object.assign(QQBridge.prototype, ...)` 保持 API
- 覆盖率：`npm run test:bridge` 真实统计 bridge.js，当前 58.04 / 83.72 / 10.56；CI 阈值 57 / 83 / 10
- 剩余：函数覆盖率仍低（大量薄包装方法只被调用链覆盖），后续按需提升
- 注意：不能再按“文件内引用数”直接删公开方法，必须先跑调用图

### 2. 真实 agent e2e 已跑通 dry-run + 真实发送，多步工具/nightly 未覆盖

- 现状：2026-11-11 通过注入通道跑通真实 DSH agent 回合
  - dry-run（turn 37）：consumed=1，trace agent 61 events，回复 `ok` 被拦，QQ 出站 0
  - 真实发送（turn 39）：`injectDryRun=false`，回复 `ok` 真的发到 owner QQ，trace `stage=reply target=private:1815442184 chars=2`
- 已修：注入回合的模型回复不再无条件拦截；只有 `injectDryRun !== false` 才拦
- 缺口：多步工具调用循环、nightly 自动化、非 owner 测试群
- 入口：`scripts/e2e-real-agent.ps1`（dry-run）、`scripts/e2e-real-send.ps1`（需显式 `-ConfirmRealSend`）
- 验收：nightly 可重复；真实发送只在测试号/测试群执行

### 2a. core+services 类型检查已清零

- 现状：`typecheck-baseline.json` 从 48 降到 0
- 已修复：acl-store / capabilities / corpus / mcping / reply-router / proactive / tool-grants / web-tools 的 JSDoc 与类型
- 规则：保持 0；新增错误直接失败

### 2a-b. 宿主包类型声明已补齐

- 新增 `lib/types/dsh-host.d.ts`，为 `dsh-llm` / `dsh-session` / `dsh-tools` 提供最小声明
- bridge typecheck 已从 3 降到 0
- 保持 0；新增宿主包入口时同步补声明

### 2b. feature 全量类型检查已清零

- 现状：`tsconfig.features.json` 全量 checkJs，当前 0 错误
- 已修复：ops/engage/ark/pvz/notice/query/media 缺失 helper 导入，以及 ops/onebot-server JSDoc 类型
- 已有防线：`test/bridge-api-contract.test.mjs` + features typecheck（新增错误直接失败）
- 后续：保持 0，不再回退

### 2c. feature package 的 dataPaths 已补齐

- 现状：14 个 feature 均有 `dataPaths`；无持久化数据的写 `[]`
- ark 声明了 `maa\data` 与 `maa\queue`
- 后续：新增 feature 必须声明；audit 可继续加提示项

### 2d. feature 包本地单测已覆盖 14/14

- 现状：14 个 feature 包中，14 个 feature 均已有本地单测（18 项）
- 已加：`scripts/test-features.mjs` + CI `feature tests` 步骤
- 风险：其余 feature 的业务分支主要靠手测/线上暴露
- 验收：每个 feature 至少一个可独立跑的单测；CI 覆盖全部 feature
- 优先级：P1，高于继续刷 bridge 覆盖率

## P2

### 3. 插件机制与 Cordis 并存

- 现状：见 ADR 0001；工具型插件已可用 `registerFeature`，领域 hook 仍需内核一行
- 已补：`ENGINEERING-STANDARD` 第 9.2 节“新增 hook 的流程”
- 验收：若迁移，完成 Cordis 插件化并保留一个版本兼容层

### 4. 运行时热插拔缺失

- 现状：启停插件需要重启 Web（秒级）
- 验收：若需要，接入 Cordis HMR；否则在文档中明确“重启级”是产品决策

### 4b. 日志 / 备份保留脚本已建立，缺定时任务

- 现状：已加 `scripts/rotate-logs.ps1`；`douyin-watch.log` 44.4 MB 已轮转为 `.1`，新文件已建立
- 现状：已加 `scripts/prune-backups.ps1`；plugin zip 11 → 8，旧 3 个移到 `backups\archive\plugin`
- 风险：长期运行继续膨胀；故障时难定位；备份目录混有历史源码
- 已接入 `health-watchdog`：每 24 小时最多执行一次，状态写 `data\maintenance-last.txt`
- 优先级：P2；不清理数据，只加策略

### 4c. 源码 git / lockfile 已建立

- 现状：`D:\DSH` 已初始化 source-only git 仓库，远端 `https://github.com/EyjaSakura/EyjaFish.git`
- 已跟踪：bridge、features、qqbot scripts/docs、配置模板；不跟踪 data/logs/backups/密钥
- lockfile：`plugins/dsh-qq-onebot-bridge/package-lock.json` 已生成（`--legacy-peer-deps`，peer 冲突已记录）
- 边界：历史提交从 2026-11-11 开始；之前的回滚仍靠 zip

### 4d. data ACL 已收紧

- 现状：`D:\DSH\qqbot\data` 关闭继承，仅 Administrators / SYSTEM / 当前用户可访问
- 已验证：当前用户可读写；health HEALTH OK
- 例外：`health-alert-state.json` 由 SYSTEM 创建，当前用户 ACL 修改被拒；不影响运行
- 回滚：ACL 备份在 `backups\data-acl-before-tighten.txt`

### 5. functions 覆盖仍低于 lines

- 现状：all-lib 84.73 / 75.30 / 72.34（lines / branches / functions）
- 风险：默认回调、错误分支可能没测
- 验收：functions ≥ 75%，branches ≥ 80%（分批提升，不一次拉满）

### 5b. all-lib 函数覆盖率已恢复到 70

- 现状：2026-11-11 为 72.34%，CI 阈值已恢复到 70
- 已补：store / stats / trace / archive 测试
- 规则：阈值只升不降；新增代码不得把 functions 拉回 70 以下
- 验收：保持 80 / 73 / 70 以上

### 5c. 整机失联心跳已配置

- 现状：healthchecks.io `DSH QQ Bot`，2 分钟周期 / 5 分钟 grace，ntfy 手机通知
- 配置：`data\heartbeat-config.json`（health ping 200；`/fail` 200；恢复 200）
- 边界：本机 watchdog 仍负责 QQ 掉线；外部心跳负责整机失联
- 验收：关机/断网超过 grace 后，ntfy 收到 down

## P3

### 6. lint/typecheck 尚未覆盖全部工程细节

- 现状：已有本地 ESLint、TypeScript（core/services/bridge/features 全量 checkJs）、自研分层 lint
- 缺口：Prettier 未接入；部分脚本/控制台代码不在 typecheck 范围
- 验收：按需补 Prettier 与脚本检查；不为了工具而工具

### 7. 部署仍是本机脚本

- 现状：`ci.ps1` + `health.ps1` + 手动重启
- 验收：如需多机/回滚，补容器化或服务化脚本

## fake-agent e2e 的边界

已用 `test/agent-loop-e2e.test.mjs` 覆盖 handoff → 假模型 followup → replyTo → 真实 OneBot WS 出站。
另已于 2026-11-11 跑通真实 DSH agent：
- dry-run：injection consumed=1，trace `stage=agent` 61 条，回复 `ok` 被拦截，QQ 出站 0
- 真实发送：`injectDryRun=false`，回复 `ok` 发到 owner QQ，trace `stage=reply target=private:1815442184`
仍未覆盖：多步工具循环、nightly 自动化、非 owner 测试群。
