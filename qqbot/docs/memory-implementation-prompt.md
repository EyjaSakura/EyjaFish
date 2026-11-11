# 给 dsh 的实现说明：记忆系统 v2（2026-11-05）

来源：主人让鱼设计、dsh 落地。设计稿见 `D:\DSH\qqbot\docs\memory-architecture.md`（先读它）。
鱼这边只做只读分析，**不动正在跑的写入路径**，避免自己改自己记忆时把当场的话弄丢。

## 一、目标（一句话）

把现在扁平的 `data\shared-memory.json` 升级成三层：事件（只追加）、事实（可覆盖可追溯）、
索引（可重建），让记忆有来龙去脉、能查、冲突能发现。

## 二、硬约束

1. 不改注入格式的"外部观感"：每个窗口看到的公共记忆块仍然是一小段文字，≤900 字。
2. 只追加不修改事件层；事实层覆盖时旧条不删，只标 superseded。
3. 隐私口径不变：只存事件摘要和产物路径，不存聊天原文。
4. 所有写入走单一入口，面板/脚本/桥不得直接改 json。
5. 迁移期间（至少两天）旧文件保留只读，出问题能切回。

## 三、文件与结构

```
D:\DSH\qqbot\data\memory\
  events.jsonl          事件，一行一条，append-only
  facts.json            事实，{"facts":[...]}
  index\by-person.json  派生物，可删可重建
  index\by-project.json
  index\timeline.json
  index\digest.json
```

事件字段（必填 who/project/kind/title）：
```json
{"id":"ev-YYYYMMDD-HHMM-<4hex>","at":<ms>,"who":"主人","project":"voice","kind":"decision",
 "title":"一句话","detail":"两三句","artifacts":["路径"],"refs":["ev-..."]}
```

事实字段：
```json
{"id":"f-0001","subject":"voice.proxy.port","claim":"代理端口 9999","since":<ms>,"until":null,
 "source":"ev-...","confidence":0.9,"status":"active","supersedes":"f-0000","tags":["voice"]}
```

## 四、实现步骤（按顺序，每步可独立验证）

1. **建目录与空文件**，写 `memory_store.js`（或同等模块）：
   - `appendEvent(ev)`：校验必填 → 追加 → 触发索引更新（异步，失败只记日志）
   - `addFact(fact)`：`status=pending` 落盘，等确认
   - `confirmFact(id, approve)`：approve 走"同 subject 冲突检查 → 旧条 superseded → 新条 active"
   - `rebuildIndex()`：从 events.jsonl 全量重算 index
2. **迁移脚本** `data\memory\migrate_v1.js`：
   - 读 `shared-memory.json`，每条 facts 生成一条 `kind=fact` 事件（`source=legacy`）+ 一条 active 事实
   - 生成后打印统计，人工核对条数
3. **注入改造**：把现在读 `shared-memory.json` 的地方换成 `buildMemoryBlock(ctx)`：
   - 参数：`who`、`activeProject`（近 72 小时有事件的项目）
   - 组成：项目 digest 一句 + active 事实 ≤12 条 + 最近 5 条事件一行一条
   - 输出 ≤900 字，超长按"事实优先"裁
4. **面板**：`/api/memory` 增加 v2 数据源；补两个视图
   - 待确认区（pending）：点确认/丢掉（丢掉标 active=false，不删）
   - 冲突区：同一 subject 两条 active 时红标，点"保留这条"
5. **工具**（可选，但建议一起）：`memory_search` / `memory_timeline` 两个只读接口，
   让模型能主动查（这是解决"随口想起来"的关键）

## 五、验收（缺一条就不算完成）

1. 写一条事件：`events.jsonl` 追加成功，`/api/memory` 5 秒内能查到（索引一致）
2. 同一 subject 写第二条：旧条 `status=superseded` 且 `until` 有值，新条 `supersedes` 指对
3. 人为造两条冲突（不做确认直接写 active）：面板出现待处理、注入里降级成"有争议"
4. 删掉整个 `index\` 目录：重启后自动重建，事件一条不少
5. 注入长度 ≤900 字，和现在的观感一致（贴一段实际注入文本给主人看）
6. 迁移后条数核对：旧 `shared-memory.json` 的 N 条 = 新事件 N 条 + active 事实 N 条
7. 回退演练：把新注入开关关掉，能立刻回到读旧文件的状态

## 六、节奏建议

先做 1、2、3（能看效果），再补 4、5。每步完给主人和鱼看结果，别一次性全上。

## 七、回退

- 保留 `shared-memory.json` 与 `shared-memory.json.bak-*`
- 注入层加开关（环境变量或配置项），关掉即回到旧路径
- 索引目录随时可删
