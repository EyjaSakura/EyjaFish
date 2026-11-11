# 依赖与审计

## 运行时依赖

桥接插件自身只声明一个运行时依赖：

| 包 | 用途 | 版本来源 |
|---|---|---|
| `ws` | OneBot 反向 WebSocket 服务端 | 宿主 profile 的 `node_modules`（当前解析到 `~/.dsh/profiles/web/node_modules/ws`） |

其余包都来自 DSH 宿主，不随插件安装：

```
@deepseek-ai/cordis
@deepseek-ai/dsh-agent
@deepseek-ai/dsh-agent-default-model
@deepseek-ai/dsh-llm
@deepseek-ai/dsh-session
@deepseek-ai/dsh-system-prompt
@deepseek-ai/dsh-tools
@deepseek-ai/schemastery
```

## 工具链（仅开发/CI）

| 工具 | 版本 | 位置 |
|---|---|---|
| ESLint | 8.57.0 | `tools/eslint` |
| TypeScript | 5.6.3 | `tools/tsc` |
| @types/node | 22.x | `tools/tsc` |

工具都在本地目录安装，CI 不依赖 `npx` 联网。

## 审计现状与限制

- 没有提交 `package-lock.json`：插件依赖由宿主提供，单独 `npm ci` 会与 DSH peer 依赖冲突。
- 因此 `npm audit` 不能直接给出完整供应链报告。
- 当前审计方式：
  1. `scripts/audit-plugins.mjs` 检查插件结构/工具数量
  2. `scripts/lint-project.mjs` 检查跨层 import
  3. `typecheck` + `no-undef` 检查代码级错误
  4. 本文档静态列出运行时/宿主依赖

## 后续

- 若发布独立包：生成 lockfile，CI 加 `npm audit --omit=dev --audit-level=high`
- 若继续跟宿主共用依赖：在部署脚本里记录宿主版本，作为运行时基线
