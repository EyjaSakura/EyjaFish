# 本地知识库

当前分类：`history`（历史）。

## 文件

```text
D:\DSH\qqbot\knowledge\history.jsonl
D:\DSH\qqbot\data\knowledge-usage.json   (运行时使用记录，自动生成)
```

## 一条知识

```json
{
  "id": "history-001",
  "category": "history",
  "text": "一句可以独立分享的小知识",
  "source": "来源",
  "tags": ["标签"],
  "weight": 1
}
```

要求：

- `id` 全局唯一，稳定不变。
- `text` 尽量 30–80 字，能独立成立。
- 不确定的事实不要写；不要在 text 里写“据说”。
- `source` 写来源，便于以后核对。
- 可用 `weight` 调整被抽中的概率（默认 1）。

## 选择规则

```text
排除最近使用过的
按最近使用时间 + weight 选择
每次使用写 knowledge-usage.json
```

## 分类

先只做 `history`。以后加 `science`、`language`、`daily` 等分类时，
每个分类一个 `knowledge/<category>.jsonl`，选择器按 `--category` 读取。

## 当前接入

```text
4A 主心跳：prompt 注入一条历史小知识
5A 启动问候：主人/朋友 prompt 注入一条历史小知识
```
