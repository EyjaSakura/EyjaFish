# memory-core

纯记忆库，不依赖 DSH / bridge / QQ。当前阶段：**stage 2 + shadow 巩固（2026-11-25 增加窗口叙事 / daily / recheck）**。

## 环境验证（2026-11-12）

```text
Node：v24.3.0
npm：11.6.0
better-sqlite3：11.10.0
安装：成功（npm install better-sqlite3@11.10.0 --save-exact）
FTS5：
  node -e "const D=require('better-sqlite3');const d=new D(':memory:');d.exec('CREATE VIRTUAL TABLE t USING fts5(x)');console.log('better-sqlite3 FTS5 ok')"
  -> better-sqlite3 FTS5 ok
ICU：
  Intl.Segmenter('zh',{granularity:'word'}) -> 今天|好累
决策：better-sqlite3
```

## 数据

```text
D:\DSH\qqbot\data\memory\memory.db
```

迁移：

```bash
cd plugins/memory-core
node migrate-cli.mjs
```

2026-11-12 首次迁移：

```text
facts 21 + events 373 -> 394 nodes
备份：D:\DSH\qqbot\backups\memory-v2-before-stage1-20261112-174908
```

## 当前边界

```text
已做：schema / FTS5 / window_turns / 队列 / 事件写入 / facts+events 迁移 / pending 确认
已做：确定性事实抽取、BM25+实体+recency+importance 排序、access_count 更新、memory_search 接新库
已做：窗口叙事（LLM + 确定性 fallback）、daily 备份/叙事/prune/conflict 统计、adapter recheck\n未做：owner-only on 的真人盲评与小流量观察（status 仍为 shadow）
```

## LLM 抽取离线评估（2026-11-19）

```bash
$env:DEEPSEEK_API_KEY = '...'
$env:DASHSCOPE_API_KEY = '...'
node bin/llm-eval.mjs --limit 35 --model both
```

结果写入 `data/memory/llm-eval-*.json`，不接 live。

24 条可用 extract 回合：

```text
deepseek-flash   解析 24/24，19 nodes，平均 119ms
qwen3-vl-plus    解析 24/24，24 nodes，平均 3340ms
```

结论：文本记忆抽取用 `deepseek-flash`；Qwen3-VL-Plus 留给看图/视频。


## 配对盲评

生成 30 组 old/new 隐藏 A/B 的盲评包：

`ash
node bin/blind-pack.mjs --count 30
`

输出 data/memory/blind-eval-*.md 与配对 key；评分完成后再打开 key。
