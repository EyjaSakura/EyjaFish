# ADR 0001：功能插件宿主保留自研一层

- 状态：已接受（过渡方案）
- 日期：2026-11-08

## 背景

本仓库运行在 Cordis 宿主里，但功能（draw / media / contacts / douyin / pvz / ark / self …）不是 Cordis 插件，而是：

- `features/<name>/package.json` 声明 `dshFeature.hooks`
- `lib/feature-loader.js` 扫描目录、读禁用表、按 hook 建映射
- bridge 在会话安装时调用这些 hook

这是历史形成的第二套插件机制，与 Cordis 的 `apply(ctx)` / `inject` 并存。

## 决策

**短期保留自研 feature host，作为 Cordis 的适配层。**

理由：

1. 功能插件已经稳定，14 个插件、工具注册和权限都跑通
2. 迁移到 Cordis 需要重做会话安装、工具面、权限与热插拔，风险高
3. 当前单用户、单实例，重启级热插拔可接受

同时做两件事降低“第二套机制”的成本：

- 工具型插件统一走 `registerFeature` 通用入口，不需要改内核
- 分层契约写进 lint/audit：feature 只能 import `lib/sdk`，插件之间禁止互相 import

## 后果

- 领域型 hook（如 `handleVoiceReading`）仍需 bridge 显式调用
- 启用/停用是重启级，不是运行时
- 未来若出现以下任一需求，再启动 Cordis 迁移：
  1. 需要不重启热插拔
  2. 需要给插件声明依赖关系/版本
  3. 第三方要独立发布插件包

## 迁移草案（未执行）

1. 把 `features/*` 包装成 Cordis 插件：导出 `apply(ctx, config)` + `inject`
2. bridge 暴露 `qq.session` / `qq.tools` / `qq.reply` 服务
3. 用 Cordis loader 替换 `feature-loader.js`
4. 保留 `registerFeature` 兼容层一个版本
