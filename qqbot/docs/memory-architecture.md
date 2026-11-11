# 记忆架构设计稿（2026-11-05，鱼提的）

## 0. 现状与问题

现在只有一个扁平清单：`data\shared-memory.json`，每条 `{text, at}`，注入到每个窗口的公共记忆块里，
加上桥每轮塞进来的几十条最近消息（`memory-recall.json` 是日志）。

三个硬伤：
1. **没有来龙去脉**：知道"有 RX 7700 XT"，不知道为它折腾了几天、卡在哪。
2. **没有冲突检测**：同一件事两处说法不一致，模型自己看不出。
3. **检索靠塞**：塞不进上下文的就等于没发生，主动翻旧账能力弱。

设计目标不是"记更多"，是**记得住、查得到、错得了能发现**。

## 1. 三层结构

### 1.1 事件层（events，只追加）

`data\memory\events.jsonl`，一行一条，永不修改、永不删除。

```json
{"id":"ev-20261105-2016-a1","at":1793881000000,"who":"主人","project":"tts","kind":"decision",
 "title":"语音走 GPU",
 "detail":"把 v4 挪到 ZLUDA 上，v2Pro 留 CPU",
 "artifacts":["D:\\DSH\\voice\\TTS-CONVENTIONS.md"],
 "refs":["ev-20261105-1430-b7"]}
```

字段约定：
- `who`：涉及的人（主人/倩倩姐/珊姐姐，或"我"）
- `project`：`voice` `maa` `pet` `memory` `qzone` `misc` …… 允许 `misc`
- `kind`：`fact` `decision` `event` `feeling` `promise` `conclusion`
- `artifacts`：产物路径（文档、脚本、日志）
- `refs`：关联的上游事件

事件层是唯一"真相"，任何事实都能回溯到事件。

### 1.2 事实层（facts，可覆盖但不可抹除）

`data\memory\facts.json`：

```json
{"id":"f-1042","subject":"tts.proxy.port","claim":"代理端口 9999",
 "since":1793870000000,"until":null,
 "source":"ev-20261105-1949-c3","confidence":0.9,
 "status":"active","supersedes":"f-0988","tags":["voice","port"]}
```

规则：
- `status`：`active` / `superseded` / `pending`（新事实先 pending，确认后才 active）
- 覆盖不删：新事实把旧的 `status=superseded`、`until` 打上、`supersedes` 指过去
- 没 `source` 的只能留在事件层，不能升成事实
- 同 `subject` 同时出现两条 `active` 就是冲突，要标红（见 3.2）

### 1.3 检索层（索引，可重建）

`data\memory\index\`（纯派生物，删了能重建）：
- `by-person.json`：人物 → 事件 id 列表
- `by-project.json`：项目 → 事件 id 列表（按时间倒序）
- `timeline.json`：按天聚合的摘要（每天一段话 + 关键事件 id）
- `digest.json`：每个项目一句话现状（给注入用）

## 2. 写入路径（单一入口）

所有写入走一个函数 `memory.write(event)`：
1. 校验字段，缺 `who/project/kind/title` 直接拒
2. 追加到 events.jsonl（`O_APPEND`，先写再更新索引）
3. 若带 `fact` 候选，生成 `pending` 事实，等确认
4. 更新索引（失败只记日志，不影响主流程）
5. 返回事件 id

铁律：**只有入口能写**；面板、脚本、桥都不直接改 json。

## 3. 读取路径

### 3.1 注入（每轮对话）

替代现在"一坨公共记忆"的做法：

1. 取当前对话对象 + 最近活跃项目（近 72 小时有事件的）
2. 从 digest 取该项目一句话现状
3. 从 facts 取 `active` 且 `subject` 命中该项目/人物的，最多 12 条
4. 从 events 取该项目最近 5 条，压成一行一条
5. 总量控制在 900 字以内，超了按"事实优先、事件其次"裁

### 3.2 冲突检测

事实写入时按 `subject` 聚合：
- 同一 subject 有两条 `active` 且 `claim` 不等价 → 都标 `conflict`，进面板"待处理"
- 面板点"保留哪条"，另一条被 supersede
- 有一周没处理的冲突，注入时降级为"有争议"，不当作事实用

### 3.3 主动检索（工具化）

给模型两个工具：
- `memory_search(query, project?, who?, since?, until?)` → 命中事件的前 200 字 + id
- `memory_timeline(project, days)` → 按天的摘要

这样"随口想起来"才成可能：先搜再答，而不是靠塞。

## 4. 迁移与验收

1. 现 `shared-memory.json` 每条 facts 转成一个 `ev-*`（kind=fact，source=legacy）+ 一条 active 事实
2. 旧注入格式保留一个兼容期（读新文件的派生结果），面板切到 v2 后删旧路径
3. 验收：
   - 写一条事件 → events.jsonl 追加成功，索引 5 秒内可查
   - 覆盖同一 subject → 旧条 superseded、新条 active、supersedes 正确
   - 造两条冲突 → 面板出现待处理，注入里降级
   - 断索引目录 → 重启后能重建，不丢事件
   - 注入长度 ≤ 900 字，和现在观感差不多

## 5. 明确不做的事

- 不做向量库（290 条规模用不上，先保证结构正确）
- 不做自动"总结成事实"（先 pending，人来确认，避免自我污染）
- 不存聊天原文（只有事件摘要 + 产物路径，隐私口径不变）
