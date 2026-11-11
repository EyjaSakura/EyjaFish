# 记忆系统 v2 落地记录（2026-11-05）

## 当前状态

**已切换**：桥的注入走 v2 事实层（`data/memory/USE_V2` 开关文件存在时）。
旧路径保留为自动回退：v2 读失败或为空 → 继续读 `shared-memory.json`。

## 文件

```
D:\DSH\qqbot\data\memory\
  memory_store.mjs     存储层（零依赖）：事件/事实/索引/注入/检索
  migrate.mjs          v1→v2 迁移（--dry-run / --apply）
  test.mjs             自检（不变量 + 覆盖 + 注入预算）
  events.jsonl         11 条（迁移自旧 facts）
  facts.json           11 条（status=active，needs_subject=true）
  subjects.json        subject 词表（暂空，待整理）
  aliases.json         旧 hash id → f-xxxx 映射
  index/               by-project / by-person / timeline / digest（可重建）
  USE_V2               开关文件：存在即启用 v2
```

## 常用命令

```bash
node D:\DSH\qqbot\data\memory\test.mjs                  # 自检
node D:\DSH\qqbot\data\memory\migrate.mjs --dry-run     # 迁移预演
node D:\DSH\qqbot\data\memory\migrate.mjs --apply       # 迁移
```

## 面板接口（只读 + 确认）

```
GET  /api/memory/v2/summary          总数/状态分布/不变量/事件数
GET  /api/memory/v2/facts?status=    事实列表
GET  /api/memory/v2/events?project=&limit=
GET  /api/memory/v2/block?project=   预览注入块（≤900 字）
GET  /api/memory/v2/search?q=&project=
POST /api/memory/v2/confirm          {id, approve}
```

旧的 `/api/memory`、`/api/memory/facts`、`/api/memory/recall` 保持兼容；
记忆海在 `USE_V2` 存在时读 v2 事实（节点 id 变成 `f-xxxx`，superseded 不上星）。

## 迁移结果

- 旧 11 条 facts → 11 条事件 + 11 条 active 事实
- 每条事实带 `legacy_id` 与 `needs_subject: true`，subject 暂为 `legacy.note.<hash>`
- 旧 id → 新 id 的映射在 `aliases.json`，确认/闪星兼容
- 事件标题来自事实文本，注入时已过滤 `kind=fact` 的事件，避免重复

## 回退

1. 删除 `D:\DSH\qqbot\data\memory\USE_V2`
2. 面板 `/api/reload` 重载插件
3. 桥自动回到 `shared-memory.json` 旧路径（旧文件与 `.bak-v2-20261105` 都在）

## 备份

```
panel/server.mjs.bak-memv2-20261105
panel/server.mjs.bak-memv2-adapter-20261105
bridge.js.bak-memv2-20261105
data/shared-memory.json.bak-v2-20261105
```

## 待办（按优先级）

1. **subject 整理**：11 条 legacy 事实的 subject 都是占位，需要人工改成 `voice.* / memory.* / misc.*`；改完冲突检测才有意义
2. **冲突面板**：v2 的 confirm 已做"同 subject 覆盖旧 active"，但面板还没有"保留哪条"的冲突视图
3. **superseded 查看**：记忆海默认隐藏已覆盖事实，需要一个开关
4. **digest 自动生成**：现在由 `rebuildIndex()` 用最新事件标题生成，太粗；应改成按项目聚合
5. **pending 流程**：新事实默认 pending，但还没有"自动抽取事实"的写入方（目前只有迁移）
6. **时间轴视图**：`index/timeline.json` 已生成，面板还没接
7. **检索工具**：`/api/memory/v2/search` 已可用，但还没接成模型工具
8. **事件去重**：appendEvent 只做 60 秒窗口去重，长期重复未处理

## 已知风险

- `USE_V2` 打开后，桥只读 v2 事实；如果 facts.json 损坏，会自动回退旧路径，不会静默丢记忆
- `memory_store.mjs` 的锁是目录锁，只在本机有效；不要在多台机器同时写同一个数据目录
- 事件文件暂无分片，>5000 条后需要按月拆分

---

## 2026-11-05 晚 · 补完与自测

### 新增/补完

1. **subject 整理**：11 条 legacy 事实全部改成语义 subject（`person.* / voice.* / memory.* / persona.* / usage.*`），写进 `subjects.json` 词表，`needs_subject` 清零
2. **过期事实修正**：`voice.tts.endpoint` 从 9880 supersede 为 9883 代理（f-0006 → f-0012）
3. **digest 改进**：优先取最近的非 fact 事件，否则取最近 active 事实；统计 activeFacts 与 lastAt
4. **时间轴**：新增 `GET /api/memory/v2/timeline?days=N`，记忆海加「时间轴」按钮（最近 30 天按天列表）
5. **已覆盖查看**：`GET /api/memory?include=superseded`，记忆海加「显示已覆盖」开关（状态存 localStorage，superseded 节点灰色）
6. **写入接口**：`POST /api/memory/v2/fact`，新事实默认 pending，配合 confirm 使用

### 自测（22/22 通过）

脚本：`D:\DSH\qqbot\data\memory\test_e2e.py`

覆盖：
- 存储单测（事件/覆盖/不变量/注入预算）
- 不变量与索引 digest
- 6 个 v2 只读接口
- 注入块 ≤900 字、无重复行
- 记忆海使用 v2 id、superseded 默认隐藏
- confirm 幂等
- **回退演练**：摘掉 USE_V2 → 回旧 id → 恢复
- 桥静态检查（hook + 语法）
- 新增事实 → pending → 丢弃
- include=superseded 可见

### 仍未做

1. **自动抽取 pending**：目前只有迁移 + 手动 API，没有"从对话里自动提事实"的写入方
2. **检索接成模型工具**：`/api/memory/v2/search` 可用，但还没注册成桥工具（memory_search / memory_timeline）
3. **事件分片**：>5000 条再按月拆分
4. **冲突人工裁决 UI**：记忆海体检能显示 conflict 计数，但没有"保留哪条"的操作（confirm 会自动 supersede）
## 2026-11-05 20:47 · 注入实测通过

- 重启 web（13080）后桥加载新代码（/api/reload 不会重载 ESM 模块，必须重启进程）
- 用户发消息后：
  - `logs/memory-v2-usage.log` → `facts=11 chars=398`
  - `memory-recall.json` 最新 ids → `f-0012 / f-0011 / f-0010`（v2 id）
- 结论：**v2 注入已生效，记忆海闪星与新 id 对得上**
## 2026-11-05 20:52 · 自动抽取 + 检索工具

### 自动抽取 pending

- 脚本：`data/memory/extract_pending.mjs`
- 数据源：`C:\Users\Eyjafjalla\qq-memory\u_*.json` 的 history（无单条时间，用「已处理条数」做水位）
- 规则：记住/自我介绍/偏好/约定 四类，claim 限 4~60 字，宁漏勿错
- 去重：与现有事实归一化比较（相等/包含/前 12 字相同）
- 产出：全部 `status=pending`，同时写一条 kind=event 的事件做溯源
- 水位：`data/memory/extract-state.json`
- 调度：面板每 10 分钟 spawn 一次（仅 USE_V2 存在时）
- 首次运行结果：3 条候选（1 条约定 + 2 条自我介绍）

### 检索工具（桥）

- `memory_search(query, project?, days?)` → 事件检索，返回 id/title/project/at/excerpt
- `memory_timeline(days?, project?)` → 按天聚合事件
- 注册条件：`USE_V2` 存在；只读，不写记忆
- 验证：`qq-bridge-debug.log` → `memory_search/memory_timeline registered`

### 两个新踩的坑

1. `/api/reload` 不会重新 import 已缓存的 ESM 模块，桥代码改动必须重启 web（13080）
2. 工具 output schema 不支持**根级** `required: [...]` 数组，只能在属性上写 `required: true`；否则整组工具静默注册失败（日志里才有 `unsupported JSON schema`）

### 当前数据

```
events 14 / facts 20
active 11 / superseded 1 / pending 3 / rejected 5（测试产生）
不变量 ok
```
## 2026-11-05 22:15 · 工具链路打通 + 事实纠错

### 权限

第一次 memory_search 被守卫拦（工具不在 TOOL_GRANTS，allowed 集合只有 29 项）。
修复两层：
1. `tool-grants.js` 增加 `tool.memory.read` → `memory_search` / `memory_timeline`
2. 守卫里加 owner 直接放行（`/^memory_/`，与 `ark_`/`pvz_` 同款兜底）

### 实测（会话 transcript）

```
22:14:05 CALL memory_search({"query":"语音 端口","days":5}) → "没有找到相关记忆"
22:14:07 CALL memory_search({"query":"9999"}) → 2 条命中（ev-...2208、ev-...2210）
```

说明工具已真正可用，返回内容正确。

### 检索语义修正

原来是整串字面匹配，`"语音 端口"` 因为空格匹配不到。
改成按 空格/逗号/顿号/分号 分词：
- 先取「全部词命中」（AND）
- 没有再退回「任一词命中」（OR）
- 按命中数 + 时间排序

验证：`语音 端口` → 2 条（含正确的那条）；`9999` → 2 条。

### 事实纠错（两次）

```
f-0006  9880 端口（旧）                       superseded
f-0012  9883 代理（我写错的旧值）             superseded
f-0021  9999 代理，9880 是后台服务（半错）     superseded
f-0022  9999 代理；10000~10003 按需后端；
        9880 旧进程不再使用                   active
```

教训：写事实前要用「端口是否在听 + 配置文件」核对，不能凭会话记忆。
## 2026-11-05 22:25 · 全量记忆体检（发现并修复 6 处扭曲）

### 修复的扭曲

1. **他人话语被记成主人档案**（最严重）
   - 珊姐姐(3355373151) 说「我是锦阳一影」「我是你主人的妹妹」
   - 抽取器把 subject 写死成 `person.owner.profile`，确认时把
     f-0001「主人是男孩子，QQ 1815442184」顶成 superseded
   - 修复：f-0001 恢复 active；两条改为 `person.shanshan.name` / `person.shanshan.relation`
2. **口语垃圾升为事实**：f-0016「哦对了，你这个…咋办」→ rejected
3. **端口事实连错两次**：9883（凭空写的）、9999+「9880 是后台服务」→
   最终 f-0022「9999 代理；10000~10003 按需后端；9880 旧进程」
4. **测试污染真实库**：e2e 每次确认 f-0012，把 9883 复活并顶掉 9999
   - 修复：测试改用临时事实，不再碰真实 id
5. **注入块挤掉主人档案**：13 条 active 取 12 条，按时间排序把 owner 挤掉
   - 修复：人物档案（`person.*`）优先，面板与桥同步
6. **自动抽取事件进注入块**：kind=event 的「自动抽取: …」混进上下文
   - 修复：注入时过滤

### 新增防线

- 抽取器按 uid 归属：owner/qianqian/shanshan；非主人 claim 自动加「某某：」前缀
- `confirmFact` 置信度保护：旧事实置信度 ≥ 新事实 +0.15 时拒绝覆盖（需 force）
- `check.mjs` 增加来源审计：人物事实来源 who 与 subject 不符会告警
- digest 生成跳过「自动抽取」事件

### 体检结论（修复后）

```
events 16 / facts 25
active 13 / superseded 3 / rejected 9（测试残留）
不变量 ok
warnings 3（f-0003 来源为倩倩转述；两条 claim 偏长，均非错误）
```
## 2026-11-05 22:30 · 测试残留清理

- `memory_store.cleanupTestFacts()`：删除 subject 以 `memory.test.` 开头的事实
- 面板接口：`POST /api/memory/v2/cleanup-tests`
- e2e 测试结束时自动调用，跑完不再留残留
- 本次清理：removed 8 → 剩 17 条（active 13 / superseded 3 / rejected 1）
- 保留的 1 条 rejected 是 f-0016（口语垃圾），作为"被丢弃"的留痕

最终状态：
```
events 16 / facts 17
active 13 / superseded 3 / rejected 1 / pending 0
不变量 ok，注入块 540 字
```
## 2026-11-05 22:35 · 人格核心 + 自检记入库

### 人格核心（记忆海 core 星）

- 来源：`personas\xiaojingyu.md`
- 旧实现：**只取文件前 12 行**，379 行的人格卡实际只覆盖第一节 → 用户看到"不完整"就是这个原因
- 新实现：按 `##` 章节解析，每节最多两条（首句 + 一条含"不要/必须/永远/别/铁律"的关键句），上限 50
- 结果：27 个章节全部覆盖，core 节点 30 → 50

### 自检记入库

- 脚本：`data/memory/ingest_selfcheck.mjs`
- 支持两种格式：`[2026-11-03 11:39] …` 与 `2026-10-31 00:45  …`
- 分类入库：`kind=conclusion`、`who=小鲸鱼`，project 按关键词判定
- 去重：正文 sha1 前 16 位，水位存 `selfcheck-state.json`（保留最近 500）
- 本次：82 条（voice 18 / memory 16 / maa 15 / qzone 5 / misc 44）
- 调度：面板每 10 分钟同时跑 `extract_pending.mjs` 和 `ingest_selfcheck.mjs`

### 验证

```
searchEvents('ZLUDA')    → 3 条（含自检记）
searchEvents('MAA 理智')  → 1 条
searchEvents('记忆星图')  → 8 条
events 98，projects: qzone 5 / misc 44 / voice 18 / memory 16 / maa 15
timeline 7 天：11-03 18 条 / 11-04 4 条 / 11-05 7 条
```

### 未入库

`运维备忘（踩过的坑）` 那一节是无日期列表，暂不导入（没有时间戳，进了时间轴会乱）；需要的话可以人工补日期后再导。
## 2026-11-05 22:45 · 记忆海按人筛选

### 后端

- 节点新增 `who` 字段：主人 / 倩倩姐 / 珊姐姐 / 小鲸鱼
- 聊天节点：按 uid 映射（原来只加载了主人、倩倩两个人的历史，**珊姐姐 0 节点**，已补上）
- 事实节点：按 source 事件 who 归一化（`用户3355373151` → 珊姐姐）
- 人格卡 + 自检记节点统一归到「小鲸鱼」

分布：主人 221 / 倩倩姐 277 / 珊姐姐 30 / 小鲸鱼 126

### 前端

- 统计卡片下方新增筛选行：全部 / 主人 / 倩倩姐 / 珊姐姐 / 小鲸鱼
- 过滤范围：节点、连线、标签、列表抽屉
- 与「类型切换」「搜索」可叠加
- 提示行显示「筛选「X」N / 总 M」

### 备份

`panel/memory.html.bak-whofilter-20261105`