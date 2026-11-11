# 工程规范（快速索引）

完整标准见：

```text
docs/ENGINEERING-STANDARD.md
```

本文件只保留最常用的入口，避免两份规范漂移。

## 分层

```text
features/<name>/     功能插件：一个功能一个包
lib/sdk/             插件唯一允许 import 的内核内容（纯函数）
lib/services/        服务层：可复用业务
lib/*.js             桥接内核：传输、会话、权限、注入、persona 注册
```

## 三条硬规则

1. 新功能默认不改 `bridge.js`；需要新能力先放 `lib/services` / SDK。
2. feature 只能 import `@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js`，不能 import 内核内部文件，也不能 feature 之间互相 import。
3. 删除/改名任何 `bridge.*` 公开方法前，必须证明调用图为 0，并跑 `test/bridge-api-contract.test.mjs`。

## 每次改动必跑

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\ci.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\health.ps1
```

## 当前门禁（以 JSON 为准）

```text
bridge 行数预算：bridge-size-budget.json
bridge 类型基线：typecheck-bridge-baseline.json（当前 0，全绿）
core+services 类型基线：typecheck-baseline.json（当前 0，全绿）
features 类型基线：typecheck-features-baseline.json（当前 0，全绿）
测试：npm run test:new --prefix D:\DSH\plugins\dsh-qq-onebot-bridge
插件审计：node D:\DSH\qqbot\scripts\audit-plugins.mjs（issues=0）
公开 API：node D:\DSH\qqbot\scripts\check-bridge-api.mjs（冻结 bridge-public-api.json）
健康看门狗：scripts\health-watchdog.ps1（计划任务 DSH-QQBot-Health，每 2 分钟）
手机推送：scripts\notify-push.ps1 + data\notify-config.json（ntfy / Server酱 / Telegram / webhook）
无人登录：管理员运行 scripts\install-health-task.ps1（SYSTEM 任务）
```

## 部署 / 回滚

```powershell
powershell -File D:\DSH\qqbot\scripts\deploy.ps1 -Action deploy
powershell -File D:\DSH\qqbot\scripts\deploy.ps1 -Action rollback
```

详见 `docs/ENGINEERING-STANDARD.md` 第 10 节、`docs/DEPLOY.md`。
