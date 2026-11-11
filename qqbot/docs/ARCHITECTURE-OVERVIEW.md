# 大肥鱼系统架构总览（v2026-11-11）

> 面向阅读的架构说明；细节与变更记录见 `ARCHITECTURE.md`、`HEALTH-2026-11-06.md`、`小鲸鱼自检记.txt`。

## 1. 总览

```
QQ / 抖音私信
   │
   ▼
┌──────────────────────────────────────────────┐
│ 接入层                                        │
│  WSL NapCat（QQ 登录，ws 6700）                │
│  DSH Web（13080，会话宿主）                    │
│  权限面板（8899）                              │
└──────────────────┬───────────────────────────┘
                   │ 入站事件 / 出站动作
                   ▼
┌──────────────────────────────────────────────┐
│ 桥接内核  D:\DSH\plugins\dsh-qq-onebot-bridge │
│  消息主流程 / 回复路由 / 会话装配 / 工具面      │
│  权限守卫 / 注入 / 队列 / 定时器                │
│  feature-loader  ← 加载功能插件                │
└──────────────────┬───────────────────────────┘
                   │ hooks 注册（27 个）
                   ▼
┌──────────────────────────────────────────────┐
│ 功能插件   D:\DSH\plugins\features\*          │
│ 14 个插件：sing / memory / media / voice      │
│ contacts / self / commands / events / jobs   │
│ draw / douyin / ark / pvz / usage            │
└──────────────────┬───────────────────────────┘
                   │ 调能力
                   ▼
┌──────────────────────────────────────────────┐
│ 能力层                                        │
│  语言 TTS 9998 → 10000-10003                 │
│  音乐 SVC 9999 → 10010（懒启动）              │
│  曲库 library.json + 入库流水线                │
│  记忆 v2（events / facts / index）            │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ 数据层                                        │
│  qqbot\data（记忆/权限/归档）                  │
│  sing\library（曲库/歌曲/歌词）                │
│  voice\models（语音模型）                      │
└──────────────────────────────────────────────┘
```

## 2. 分层职责

| 层 | 组件 | 职责 |
|---|---|---|
| 接入 | NapCat / DSH Web / 面板 | QQ 协议、会话宿主、可视化 |
| 内核 | bridge（997 非空行，2026-11-11） | 消息管道、会话装配、权限、队列、定时器 |
| 功能 | 14 个插件包 | 各自业务，只通过 hook 注入内核 API |
| 能力 | 网关 + 脚本 | TTS、SVC、曲库、记忆、入库 |
| 数据 | data / library / models | 单一事实源 |
| 运维 | boot / start-stop / 看门狗 / 插件 CLI | 启停与观测 |

## 3. 内核里还剩什么

```
inbound-gate        入站前置
message-pipeline    消息主流程（701 行）
reply-router        回复分片/限流/转发
session-events      会话事件/文本捕获
session-install     会话装配
tool-surface        工具面裁剪与注册
outbox / deferred   队列
feature-loader      插件加载
少量发送底层 + 定时器
```

业务逻辑不在这里——唱歌、媒体、语音、命令、事件全在插件。

## 4. 插件机制

### 加载

```
启动 → feature-loader 扫描 features\*
     → 跳过 disabled.json 里的名字
     → import 每个 index.js，读取 hooks
     → 写 status.json（loaded/disabled/failed + hooks + dataPaths）
```

### hook 调用

内核 20 个位置统一模式：

```js
const feature = __FEATURES.get('registerSingTools')
if (!feature) { debugLog('[feature] registerSingTools 未加载，功能已停用'); return }
return feature(ctx)   // 注入 defineTool / agentCtx / route / bridge API
```

**strict**：没有插件就不注册工具，不回退。

### 隔离三层

| 层 | 手段 | 效果 |
|---|---|---|
| 加载 | 每个包独立 try/catch | 一个插件加载失败不影响其他 |
| 工具 | strict 注册 | 停用即无入口 |
| 数据 | `dataPaths` + 系统提示禁令 | 明确告知不能读写这些路径 |
| 审计 | `features.ps1 audit` | 列出停用项与风险 |

边界：这是提示词级隔离，不是 OS ACL；有 shell/read 权限的身份可在系统层绕过。

## 5. 启停与观测

```
D:\DSH\plugins\features\disabled.json   停用名单
D:\DSH\plugins\features\status.json     每次启动的真实状态
D:\DSH\qqbot\scripts\features.ps1       list / status / disable / enable / audit
```

## 6. 关键数据流

### 点歌

```
QQ「唱晴天」→ 入站 → message-pipeline → session-install
→ qq_sing（sing 插件）→ library.json → ffmpeg 切片
→ 语音条回当前聊天
```

### 发歌入库

```
白名单发 flac → events 插件转存 → incoming
→ ingest_song.py（demucs + SVC + 混音 + 歌词）
→ 写库（needs_sections）→ 她自己标段落
```

### TTS

```
要求语音 → media/voice 插件 → 9998 网关 → 模型后端
→ mp3 → record 段
```

### 后台任务

```
jobs 插件每 10s 轮询抖音分析结果 → 注入会话 → 她回复
```

## 7. 部署形态

```
D:\DSH\plugins\dsh-qq-onebot-bridge\      内核（本地包）
D:\DSH\plugins\features\<name>\            14 个功能包
profile\node_modules\@zfqxuz\...           junction → 内核
D:\DSH\plugins\node_modules\               junction → 依赖
```

DSH 仍按原包名加载；代码不再散落在 `node_modules`。

## 8. 端口

```
13080 web   8899 面板   6700 QQ 桥
9998 语言网关 → 10000-10003
9999 音乐网关 → 10010（空闲回收 1800s）
```

## 9. 技术债与边界

| 项 | 状态 |
|---|---|
| 内核仍是本地 fork（npm 包内补丁） | 升级需对比合并 |
| 数据隔离是提示词级 | 要硬封锁需 Windows ACL |
| 插件启停需重启 web | 可接面板按钮 |
| 部分敏感配置明文 | 建议收 ACL / 凭据存储 |
| 曲库 schema 无版本号 | 建议加 schema + 迁移 |

## 10. 一句话

**QQ 是唯一入口，bridge 是唯一出口；功能一个包一个包地挂在它后面，数据各归各的目录。**
