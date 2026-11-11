# 大肥鱼系统架构（2026-11-06）

> **冻结版本 v2026-11-06**：bridge.js 12,665 → 8,066 行（内核约 8,000 行），29 个模块，全部功能测试通过。
> 面向阅读的版本见 [ARCHITECTURE-OVERVIEW.md](ARCHITECTURE-OVERVIEW.md)。
> 备份：`D:\DSH\qqbot\backups\bridge-modular-2026-11-06\`（含 lib、包信息、架构与体检文档、README 恢复步骤）。
> 插件化：代码已迁到 `D:\DSH\plugins\dsh-qq-onebot-bridge\`，`node_modules` 仅保留 junction；DSH 仍按原包名加载。
> 注意：这是对插件的本地副本，npm 升级会替换 junction；恢复/合并方法见插件目录的 README-PLUGIN.md。

## 功能插件化（已完成，11 个插件）

目标：一个功能 = 一个独立包，只影响自己；停用插件 = 停用功能。

```
D:\DSH\plugins\
  dsh-qq-onebot-bridge\     桥接内核 + lib\feature-loader.js
  features\
    sing\                   @fish/feature-sing      ✅ 已迁（1 hook）
    memory\                 @fish/feature-memory    ✅ 已迁（1 hook）
    media\                  @fish/feature-media     ✅ 已迁（1 hook）
    voice\                  @fish/feature-voice     ✅ 已迁（4 hooks）
    contacts\               @fish/feature-contacts  ✅ 已迁（3 hooks）
    self\                   @fish/feature-self      ✅ 已迁（1 hook）
    commands\               @fish/feature-commands  ✅ 已迁（6 hooks：ops/engage/help/admin/reminder/worklog）
    events\                 @fish/feature-events    ✅ 已迁（4 hooks）
    jobs\                   @fish/feature-jobs      ✅ 已迁（1 hook）
    usage\                  @fish/feature-usage     ✅ 已迁（1 hook：用量报表）
    draw\                   @fish/feature-draw      ✅ 已迁（1 hook：qq_draw 生图）
    douyin\                 @fish/feature-douyin    ✅ 已迁（1 hook：抖音工具，从 contacts 拆出）
    pvz\                    @fish/feature-pvz       ✅ 已迁（1 hook：pvz 工具）
    ark\                    @fish/feature-ark       ✅ 已迁（1 hook：方舟工具）
```

当前：`features=14 hooks=27 tools=79`，审计脚本 `scripts/audit-plugins.mjs` 输出 `issues=0`。

约定：

- 每个功能目录包含 `package.json`（含 `dshFeature.hooks`）和 `index.js`（导出 `hooks = { registerXxx }`）
- 内核启动时扫描 `features\`，同名 hook 优先调用插件；加载失败只影响该插件
- 每个插件的 hook 通过注入的 `bridge` API 访问私有能力，不直接碰内核

所有功能均已迁移为独立包；内核只保留路由、会话、权限、注入等公共能力，具体功能通过 hooks 注入。

**隔离**：已去掉内核 fallback + 启停清单 `features/disabled.json`，停用插件即不注册对应工具。

**已完成（v2026-11-06 晚）**：

- 内核 20 个 delegate 全部改为 strict：没有插件就**不注册任何工具**，并写日志 `[feature] <hook> 未加载，功能已停用`
- 启停清单：`D:\DSH\plugins\features\disabled.json`，内容为插件目录名数组，例如 `["sing"]`
- 验证：停用 sing 后新会话工具清单里 `sing: []`（78 个工具），help/voice 不受影响；恢复后 `qq_sing` 回来（84 个工具）

注意：停用插件只影响**工具注册**；如果会话本身有 shell/read 权限，模型仍可能绕过工具直接读数据文件（例如曲库 json）。要彻底封锁，需要同时收紧该会话的 fs 权限。

### 插件状态与启停

- 内核启动时写 `D:\DSH\plugins\features\status.json`：每个插件的 loaded / disabled / failed 与 hooks
- 管理命令：

```powershell
powershell -File D:\DSH\qqbot\scripts\features.ps1 list
powershell -File D:\DSH\qqbot\scripts\features.ps1 disable sing
powershell -File D:\DSH\qqbot\scripts\features.ps1 enable sing
powershell -File D:\DSH\qqbot\scripts\features.ps1 status
```

- 启停后需要重启 web 才生效（或加 `-Restart`）

### 停用后的数据隔离

- 每个插件的 `package.json` 可声明 `dshFeature.dataPaths`（它拥有的数据目录/文件）
- 停用时 loader 把这些路径写进 `status.json`，内核在会话系统提示里追加 `qq-feature-isolation` 段：
  > 以下功能已停用：sing。禁止通过 read / pwsh / 文件工具读取或写入这些路径：D:\DSH\sing\library；D:\DSH\sing\outputs
- `features.ps1 audit` 会列出停用插件的数据路径，并提示「有 shell/read 权限的身份仍可在系统层绕过」
- 实测：停用 sing 后要求用 pwsh 读曲库，模型回复「这个读不了，唱歌功能已经停用了，那个目录我也不能碰」

**边界**：这是提示词级隔离，不是 OS 级 ACL。要对主人也硬封锁，需要在 Windows 层对该账号做 ACL 拒绝（高风险，未做）。

## 插件部署形态

```
D:\DSH\plugins\dsh-qq-onebot-bridge\            插件本体（完整包：lib/client/control/package.json）
D:\DSH\plugins\node_modules\                    junction → profile node_modules（依赖解析）
profile\node_modules\@zfqxuz\dsh-qq-onebot-bridge
                                                junction → D:\DSH\plugins\dsh-qq-onebot-bridge
```

- DSH 加载名不变：`@zfqxuz/dsh-qq-onebot-bridge`
- 代码不再散落在 `node_modules`，可单独备份、对比、版本化
- 真正交给 `plugin_manager` 管理（安装/升级/禁用）仍需改包名并在 profile 禁用原行



## 0. 一句话

QQ 是唯一入口，bridge 是唯一出口；语言、音乐、曲库、记忆都是挂在 bridge 后面的能力模块。

## 1. 分层图

```
                         ┌──────────────────────────────┐
  手机 QQ / 抖音私信 ───►│  L0 接入层                    │
                         │  WSL NapCat  (QQ, ws 6700)    │
                         │  DSH Web     (13080)          │
                         │  权限面板    (8899)           │
                         └──────────────┬───────────────┘
                                        │ 入站事件 / 出站动作
                         ┌──────────────▼───────────────┐
                         │  L1 代理层                    │
                         │  qq-onebot-bridge             │
                         │  会话 / 权限守卫 / 工具面       │
                         │  注入 / 媒体 / 定时器          │
                         └───┬────────┬────────┬────────┘
                             │        │        │
        ┌────────────────────▼──┐  ┌──▼─────┐  ┌▼──────────────┐
        │ L2 能力层              │  │ 曲库    │  │ 记忆 v2        │
        │ 语言 TTS 网关 9998     │  │ library │  │ events/facts   │
        │  ├ 10000 纯烬 v2pro    │  │ ingest  │  │ index/*        │
        │  ├ 10001 纯烬 v4 GPU   │  │ lyrics  │  │ memory_* 工具  │
        │  ├ 10002 隐德来希 v2pro│  └────────┘  └────────────────┘
        │  └ 10003 隐德来希 v4   │
        │ 音乐网关 9999 → 10010  │
        │  └ 本兮 SVC (CPU)      │
        └────────────┬───────────┘
                     │
        ┌────────────▼──────────────────────────────────────┐
        │ L3 数据层                                          │
        │ qqbot\data   memory / perms / archive / sessions   │
        │ sing\library library.json / songs / incoming       │
        │ voice\models 小寒 chunjin etlchi                    │
        │ 语音模型      对外分发的 zip 备份                    │
        └───────────────────────────────────────────────────┘

        ┌───────────────────────────────────────────────────┐
        │ L4 运维层                                          │
        │ boot-start.ps1 → start-stack.ps1 → 各网关           │
        │ watcher-watchdog 守护；stop-stack 全停              │
        │ 计划任务：DSH-Boot / Heartbeat / Watcher            │
        │ logs\ 按组件分文件                                 │
        └───────────────────────────────────────────────────┘
```

## 2. 组件与职责

### L0 接入

| 组件 | 位置 | 职责 |
|---|---|---|
| NapCat | WSL Ubuntu，screen 会话 | QQ 登录、OneBot v11 协议、反向 WS 连 6700 |
| DSH Web | 127.0.0.1:13080 | 会话宿主、模型调用、插件加载 |
| 权限面板 | 127.0.0.1:8899 | 状态快照、权限配置、会话查看 |
| NapCat WebUI | 127.0.0.1:6099 | 扫码登录（**以后扫码一律开这个**） |

### L1 代理（qq-onebot-bridge）

单一职责：**把 QQ 事件变成 agent 回合，把工具调用变回 QQ 动作**。

| 子职责 | 实现 |
|---|---|
| 会话 | 每个群/私聊独立 session，resume |
| 权限 | `perms.json` + `allowUsers/adminUsers` + 守卫白名单 |
| 工具面 | 宿主工具 restrict 裁剪 + scoped 工具按权限注册 |
| 注入 | 定时自由时间、抖音私信、分析结果回调 |
| 媒体 | 图片/语音/文件收发、转存 |
| 定时 | 心跳、看门狗、QZone 轮询、抖音收件箱 |

**关键边界**：bridge 不实现业务能力，只做编排；业务在 L2。

### L2 能力

| 能力 | 入口 | 数据 |
|---|---|---|
| 语言 TTS | 9998 网关，按端口分发到 10000-10003 | `voice\models` + `voice\configs` |
| 音乐 SVC | 9999 网关，懒启动 10010 | `sing\backups\SVC\本兮\payload` |
| 曲库点歌 | `qq_sing` 系列（独立模块 `lib/sing-tools.js`） | `sing\library\library.json` |
| 入库 | `ingest_song.py`（CLI） | incoming → songs/<标题> |
| 记忆 | `memory_search/timeline` + 自检脚本 | `qqbot\data\memory` |

### L3 数据（单一事实源）

| 数据 | 位置 | 说明 |
|---|---|---|
| 端口 | `D:\DSH\ports.json` | 唯一端口事实源，网关/启动脚本都读它 |
| 曲库 | `sing\library\library.json` | 歌、段落、歌词、vocal_start |
| 记忆 | `qqbot\data\memory\events.jsonl` + `facts.json` | events 追加，facts 覆盖 |
| 权限 | `qqbot\data\perms.json` | 每人 shell/fs/voice/file 开关 |
| 模型 | `voice\models`、`sing\backups\SVC` | 可重建，别手改 |

### L4 运维

```
开机：HKCU Run → scripts\boot-start.ps1
        ├ 等校园网 → 登录（5 次 × 3s）
        ├ 起 9998 / 9999
        └ 起 start-stack（web 13080 + panel 8899）
守护：DSH-QQBot-Watcher → watcher-watchdog.ps1
停止：stop-stack.ps1
```

## 3. 端口契约

| 端口 | 用途 | 生命周期 |
|---|---|---|
| 13080 | DSH Web | 常驻 |
| 8899 | 权限面板 | 常驻 |
| 6700 | bridge WS（NapCat 反向连接） | 随 web |
| 6099 | NapCat WebUI | 随 NapCat |
| 9998 | 语言网关 | 常驻 |
| 10000-10003 | 语言模型后端 | 懒加载 |
| 9999 | 音乐网关 | 常驻 |
| 10010-10019 | 音乐模型后端 | 懒加载，空闲 1800s 回收 |

## 4. 关键数据流

### 4.1 点歌

```
QQ「唱《晴天》」
  → bridge 入站 → agent 回合
  → qq_sing(title, seconds=60, accomp, section)
  → 读 library.json → 定位 vocal_start / 段落 / 歌词行
  → ffmpeg 切片（句末对齐，≤60s）
  → 语音条（record）回当前聊天
```

### 4.2 白名单发歌 → 自动学

```
倩倩/珊 发 .flac/.mp3
  → bridge 文件转存
  → 复制到 sing\library\incoming\
  → spawn ingest_song.py --all（带 lock）
  → demucs 分离 → SVC 转换 → 混音 → 抓 LRC → 写库（needs_sections）
  → 她按协议自己标主歌/副歌 → qq_sing_save_sections
```

### 4.3 视频分析

```
抖音私信视频 → bridge 下载 → douyin_analyze_video 写 commands/pending
  → 外部分析进程写 dm-results.jsonl
  → bridge #pollAnalyzeResults 注入结果 → 她用 douyin_send 回
```

## 5. 解耦原则（已落地 / 待落地）

### 已落地

**能力模块（bridge 只做委托，私有能力靠注入）**

| 模块 | 行数 | 职责 | 注入的 bridge 能力 |
|---|---|---|---|
| `lib/sing-tools.js` | 261 | 点歌 / 曲库 / 歌词 / 段落 / 入库调度 | injectionSuppressed, markSuppressed, sendVoice |
| `lib/memory-tools.js` | 111 | memory_search / memory_timeline | 无（纯文件 + 动态 import） |
| `lib/media-tools.js` | 107 | 发图片 / 发文件 / TTS 语音 / 音频当语音条 / 撤回 | writeGate, sendRoots, resolveSendPath, sendImageTo, sendFileTo, sendVoiceTo, sendRecord, recallRecent, chatKeyOf, ttsUsable, injectionSuppressed, markSuppressed |
| `lib/analyze-poller.js` | 50 | 抖音分析结果轮询与注入 | ownerQQ, inject, getDryRun, setDryRun, debugLog |
| `lib/query-tools.js` | 122 | 群成员 / 历史 / 表情回应 | recentHistory 等 3 个 |
| `lib/owner-tools.js` | 88 | 主人专属：聊天摘要等 | ownerQQ, contacts |
| `lib/identity-tools.js` | 686 | 好友身份 / 头像 / 名片 / 活动 | 10 个（ownerQQ, recordMemory, sendImageTo…） |
| `lib/self-tools.js` | 915 | 抖音 / B 站 / 表情包 / QZone / 游戏等自注册工具 | 10 个（qzoneRequest, saveFaceToQq…） |
| `lib/ops-commands.js` | 733 | 群运营命令（成员 / 权限 / 审批 / 日志） | 7 个（safeReply, isAdmin, runOpsAction…） |
| `lib/engage-commands.js` | 163 | 互动命令（/赞榜、/谁赞了、戳一戳） | 7 个（safeReply, engageQuota…） |
| `lib/help-command.js` | 147 | 使用指南 / 帮助 | 4 个（safeReply, isAdmin, canSwitchWorkspace…） |
| `lib/reply-router.js` | 137 | 回复路由：分片 / 限流 / 转发卡片 | 11 个（sendForwardCard, shouldForward, rateLimit…） |
| `lib/session-events.js` | 133 | 会话事件：文本捕获 / 注入拦截 / 回复兜底 | 6 个（replyTo, recordMemory, flushDeferred…） |
| `lib/message-pipeline.js` | 701 | 入站消息主流程（文本/图片/语音/文件/命令分发） | 90 个 |
| `lib/admin-command.js` | 130 | 管理命令（重启 / 记忆清理 / 轮换） | 5 个 |
| `lib/notice-events.js` | 111 | 通知事件（戳一戳 / 撤回 / 入群 / 通知） | 10 个 |
| `lib/private-files.js` | 67 | 私聊文件转存 + 音频自动入库 | 1 个（safeReply） |
| `lib/inbound-gate.js` | 20 | 入站前置：去重 / 权限 / 兜底 | 3 个 |
| `lib/voice-reading.js` | 44 | 语音消息朗读 | 2 个 |
| `lib/voice-tts.js` | 59 | TTS 合成并发送语音 | 1 个 |
| `lib/voice-synth.js` | 24 | 语音文件合成（ffmpeg 转 mp3） | 1 个 |
| `lib/voice-message.js` | 34 | 私聊/引用语音处理 | 7 个 |
| `lib/incoming-video.js` | 56 | 入站视频转存 | 0 个 |
| `lib/group-files.js` | 127 | 群文件/群文件夹命令 | 5 个 |
| `lib/tool-surface.js` | 248 | 工具面装配：restrict 裁剪 + scoped 注册 + 自检 | 11 个 |
| `lib/session-install.js` | 97 | 会话装配：人格/记忆段 + 工具面 + 身份段 | 13 个 |
| `lib/outbox.js` | 75 | 离线待发队列：持久化 / 补发 / 过期清理 | 无（用 bridge 公共字段） |
| `lib/deferred.js` | 76 | 入站排队：持久化 / 恢复补处理 / 启动清积压 | onQqMessage, debugLog |
| `lib/shared-helpers.js` | 37 | 模块共用纯函数（assistantText / splitSegments / isQuietTime） | 无 |

**统一注入桥**：`#bridgeApi(privates)` 用 Proxy 暴露私有方法白名单，公共字段（config / server / gate / memoryDir 及 reactions / recentTexts / trace 等实例字段）回落到实例本身，模块不再直接碰 `#private`。

bridge.js 从 12,665 行降到 8,066 行，业务、装配与队列都在模块里，bridge 只剩定时器编排与少量发送底层。

2. **品牌模块独立**：抖音/B站等都在各自 scoped 注册，不进 bridge 主体
3. **曲库脚本独立**：`ingest_song.py` / `lyrics_fetch.py` 是纯 CLI，可单测
4. **端口单一事实源**：`ports.json`
5. **权限单一事实源**：`perms.json` + 守卫白名单

### 待落地（技术债）

| 债 | 现状 | 建议 |
|---|---|---|
| bridge.js 单体 | 12,665 行，81 处「本地补丁」标记 | 按能力逐步外移：抖音轮询 → `lib/douyin-tools.js`；媒体 → `lib/media-tools.js` |
| npm 包内直接改 | 升级会被覆盖 | 生成 `patches/*.diff` + `apply-patches.ps1`，或向上游提 PR |
| 硬编码路径 | 散落 D:\ 绝对路径 | 引入 `config/paths.json`，脚本统一读取 |
| 缺失 preset/插件 | `qq-coding` preset、`dsh-tool-fs-jailed` 每次会话告警 | 要么补包，要么从会话配置清掉 |
| 曲库 schema 无版本 | 字段自由增长 | 加 `schema: 2` + 迁移脚本 |
| 音乐后端单实例 | 所有歌共用一个 SVC 进程 | 预留 10011-10019 给多角色/多预设 |

## 6. 目录职责

```
D:\DSH\
  ports.json           端口事实源
  qqbot\               机器人本体与数据
    start-stack.ps1    启动 web+panel
    stop-stack.ps1     全停
    scripts\           boot-start / campus-login / webui-autologin
    data\              memory / perms / archive
    panel\             8899 面板
    logs\              运行日志
    archive\           历史一次性脚本、媒体、db
    docs\              架构、体检、交接
  voice\               语言模型（TTS）
    models\ configs\ env\ datasets\ tools\
  sing\                音乐（SVC）
    svc_env212\ music_proxy.py svc_server.py
    library\           library.json / ingest / lyrics / songs
    backups\SVC\       模型与预设
    benxi\ sep\ sliced\ 训练数据链
    hf_cache\          HuBERT / demucs 权重
    logs\ outputs\
D:\语音模型\
  语言模型\            对外分发的语音模型 zip
  音乐模型\            对外分发的 SVC zip
```

## 7. 运维命令

```powershell
# 健康
Get-NetTCPConnection -State Listen | ? LocalPort -in 13080,8899,6700,9998,9999
curl http://127.0.0.1:9999/health
curl http://127.0.0.1:8899/api/state

# 启动 / 停止
powershell -File D:\DSH\qqbot\start-stack.ps1
powershell -File D:\DSH\qqbot\stop-stack.ps1

# 曲库
python D:\DSH\sing\library\sing_manager.py list
python D:\DSH\sing\library\ingest_song.py --all
```

## 8. 变更记录

- 2026-11-06 唱歌模块抽离为 `sing-tools.js`；bridge 增加 restrict 名单过滤；`qq_send_voice` 去重；分析结果轮询加固；归档一次性脚本与过期任务。

## 分层契约（2026-11-08）

```
features/        功能插件（11 个）：只依赖 SDK，不碰内核
   ↓ 只能 import lib/sdk
lib/sdk/         共享纯函数（onebot 解析、文件大小、TTS 合成）
lib/core/        routing + chat-key + mention + identity-config + agent-mounting + session-registry + session-opener + session-entry + session-factory + session-maintenance + inject-guard + deferred-inject-queue + inject-handler + inject-window
lib/*.js         桥接内核：OneBot 传输、会话、权限、注入、persona
```

规则：

- 功能插件只能 `import .../lib/sdk/index.js`；越层 import 会被 `scripts/audit-plugins.mjs` 判定失败
- 内核通过注入的 `bridge` API 给插件私有能力，插件不直接访问内核文件
- 插件清单：`package.json` 的 `dshFeature.hooks` + `index.js` 的 `hooks` 必须一致
- 停用：`features/disabled.json` 写插件目录名，重启后不加载；工具不注册

### 热插拔（重启级）

已验证：

| 操作 | 结果 |
|---|---|
| 把 `draw` 写进 disabled.json | draw 状态 disabled，核心与其它插件正常，审计仍 0 问题 |
| 移除后重启 | draw 恢复 loaded（1 hook） |

新增插件：目录 + `package.json` + `index.js`，实现已有 hook 即可被加载；
如果引入**新的 hook 名**，需要内核加一行调用（当前架构的已知限制）。

### 审计

```powershell
node D:\DSH\qqbot\scripts\audit-plugins.mjs
# features=14 hooks=27 tools=79 issues=0
```

检查：manifest、hooks 一致性、hook 是否被调用、重复 hook、重复工具、越层 import、SDK 目标存在。

### 已知技术债

- 测试与 CI：新增 `test/*.test.mjs`（754 个用例，含反向 WS e2e、action 往返、reply-router 发送 e2e、qzone-client、notify、watchdog-report、binding-targets、runtime-snapshot、contacts-store、session-turns、session-opener/entry/factory/maintenance、tool-timeout、imagegen 编排/配置/缓存/提供商（openai+pollinations+dashscope+local-sd generate）、卡片解析、tool-grants、session-install、message-pipeline 与 self 插件测试）与 `scripts/ci.ps1`（audit + tests + syntax）
- `lib/bridge.js` 约 7.8k 行，仍承担传输/会话/注入/权限等多职责；已抽出 persona、douyin-prompt 到 services，后续按 core/session/inject 继续拆
- ~~`features/contacts/identity.js` 混四类工具~~ 已拆为 contacts / douyin / pvz / ark 四个插件
- 通用 `registerFeature` 已上线（draw 已迁移验证）；剩余：领域新 hook 仍需内核一行调用，可继续用通用入口替代


## 架构决策与技术债

- ADR：`docs/adr/0001-feature-host.md`（功能插件宿主保留自研一层）
- 技术债登记：`docs/DEBT.md`（P1/P2/P3 + 验收标准）
