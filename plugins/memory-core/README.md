# memory-core

纯记忆库，不依赖 DSH / bridge / QQ。当前阶段：**stage 1（轻量写入）**。

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
未做：LLM 抽取评分、narrative、完整 recall 排序（stage 1.5 / stage 2）
```
