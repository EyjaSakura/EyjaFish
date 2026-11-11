# 功能插件规范

> 完整全量工程标准见 `D:\DSH\qqbot\docs\ENGINEERING-STANDARD.md`。
> 本文件是**速查**，不是第二套规则；与标准冲突时，以标准为准。
> 新增功能前先读完整标准。

一个插件 = `features/<name>/` 目录，内核启动时自动扫描，无需改桥接代码（使用已有 hook 时）。

当前共有 14 个 feature：ark / commands / contacts / douyin / draw / events / jobs / media / memory / pvz / self / sing / usage / voice。

## 目录

```
features/<name>/
  package.json     必须：name / version / type: module / dshFeature.hooks
  index.js         必须：export const hooks = { registerXxx }
  其它模块          可选：工具实现、数据读写
```

`package.json` 示例：

```json
{
  "name": "@fish/feature-example",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "dshFeature": {
    "hooks": ["registerExampleTools"],
    "dataPaths": ["D:\\DSH\\qqbot\\data\\example.json"]
  }
}
```

## 约束

1. **只能从 SDK 导入桥接能力**：`@zfqxuz/dsh-qq-onebot-bridge/lib/sdk/index.js`
   不能 import `lib/bridge.js`、`lib/onebot.js` 等内核文件。
2. **一个 hook 只能被一个插件占用**：重复会在加载日志里报 `duplicate hook`。
3. **停用即隔离**：把目录名写进 `features/disabled.json`，重启后不加载，工具不注册。
4. **数据路径**：用到的持久化文件写进 `dshFeature.dataPaths`，便于停用隔离与备份。

## 通用工具入口（推荐）

只注册工具的插件不必新增领域 hook：

```js
export function registerFeature({ defineTool, agentCtx, route, key, bridge }) { ... }
export const hooks = { registerFeature }
```

内核会自动调用它；注册的工具默认只给主人。需要放行别人时在 `tool-surface.js` 显式声明。

## 现有 hook

| 插件 | hooks |
|---|---|
| commands | handleOpsCommand, handleEngageCommand, handleHelp, handleAdminCommand, registerReminderTools, registerWorklogTools |
| contacts | registerIdentityTools, registerOwnerTools, registerQueryTools |
| douyin | registerDouyinTools |
| pvz | registerPvzTools |
| ark | registerArkTools |
| draw | registerFeature（通用工具入口） |
| events | handlePrivateFiles, handleIncomingVideo, handleGroupFiles, onNotice |
| jobs | pollAnalyzeResults |
| media | registerMediaTools |
| memory | registerMemoryTools |
| self | registerSelfTools |
| sing | registerSingTools |
| usage | registerUsageTools |
| voice | handleVoiceReading, sendTts, synthVoiceFile, handleVoice |

## 调用合同

feature 可以调用注入的 `bridge`，但只能用公开方法/状态字段：

```js
bridge.safeReply(message, '...')
bridge.writeGate(route, 'qq.write.send')
bridge.sendImageTo(route, file, caption)
```

禁止：

- import `lib/bridge.js` / `lib/onebot.js` 等内核文件
- 读写 `bridge.#私有` 字段
- feature 之间互相 import
- 为了省事在 feature 里复制一份内核实现

新增 `bridge.*` 调用时，必须同时更新并通过：

```text
test/bridge-api-contract.test.mjs
```

该测试会扫描 `features/**/*.js`、`message-pipeline.js`、`reply-router.js`，缺少公开方法会直接失败。

## 检查

```powershell
node D:\DSH\qqbot\scripts\audit-plugins.mjs
npm run test:new --prefix D:\DSH\plugins\dsh-qq-onebot-bridge
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\ci.ps1
```

必须：

- `audit-plugins.mjs` 输出 `issues=0`
- `test:new` 通过
- `ci.ps1` 输出 `CI OK`
- 重启后 `[feature] loaded <name>`
- 真实链路手测一条
