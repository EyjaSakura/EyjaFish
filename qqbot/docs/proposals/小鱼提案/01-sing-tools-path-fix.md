# 01 唱歌插件的歌词/入库脚本路径失效

状态：待评估
提出：小鲸鱼（2026-11-10 16:47）
范围：`D:\DSH\plugins\dsh-qq-onebot-bridge\lib\sing-tools.js`

## 现象

曲库目录被标准化之后，`qq_sing_lyrics` 和 `qq_sing_ingest` 两个工具都会报错：

- `qq_sing_lyrics` 返回：`抓歌词失败：... can't open file 'D:\DSH\sing\library\lyrics_fetch.py': [Errno 2] No such file or directory`
- `qq_sing_ingest` 拼的路径 `D:\DSH\sing\library\ingest_song.py` 同样不存在（尚未实际触发，但 `Test-Path` 返回 False）。

唱歌本身（`qq_sing`）没问题，段落（`sections`）也已经标好，坏的只是这两个辅路径。

## 证据

标准化后的曲库实际结构（一首歌一个目录）：

```
D:\DSH\sing\library\
  library.json            29 首索引，含 id/title/sections/vocal_start/line_starts
  caution.json
  songs\
    song-20261110-2cd557\ 读心术
      lyrics.json         {"schema_version":"1.0","provider":"netease","lines":[{"t":25.03,"text":"..."}]}
      sections.json
      meta.json
      mix.wav  vocal_svc.wav  instrumental.wav  source.flac
    song-20261109-8149\   越来越不懂（同结构）
```

插件里的硬编码路径与现状不符：

- `lib\sing-tools.js:157-159` 调用 `D:\DSH\sing\library\lyrics_fetch.py --title ... --update-library`
- `lib\sing-tools.js:11` 定义 `INGEST_SCRIPT = 'D:\DSH\sing\library\ingest_song.py'`
- `lib\sing-tools.js:155` 只在 `song.lyrics` 为空时才去抓，而标准化后歌词存在 `songs\<id>\lyrics.json` 的 `lines` 里，`library.json` 里没有 `lyrics` 字段，所以每次都会走进抓取分支

全盘搜索确认：`D:\DSH` 下已不存在任何 `lyrics_fetch.py` / `ingest_song.py`。

## 可选方案

A. 只读本地（改动最小）
`qq_sing_lyrics` 先按 `song.id` / `song.file` 的目录读 `songs\<id>\lyrics.json`，取 `lines` 直接用；读不到再走抓取，抓取脚本不存在时直接返回「这首歌没有歌词文件」，不再报执行错误。

B. 补回抓取脚本
在 `library\tools\` 下重写 `lyrics_fetch.py`，按 `song.schema` 写 `songs\<id>\lyrics.json`，并把插件路径改成 `library\tools\lyrics_fetch.py`。适合以后还要给新歌补歌词的情况。

C. 迁移期兼容
A+B 都做：优先本地，缺失才调用 B 的脚本。

## 建议

先做 A，把两个现成工具救活，成本几乎为零；B 挪到下次入库新歌时一起做，避免现在写两份歌词落盘逻辑。`qq_sing_ingest` 的脚本路径同理，建议等脚本重写时再一起改，改之前工具里直接提示「入库脚本待恢复」。

## 验收标准

1. 对已入库的任意一首（例如「读心术」「越来越不懂」）调用 `qq_sing_lyrics`，能返回带时间轴歌词，且不触发任何 python 调用。
2. 对不存在歌词文件的歌，返回一句人话提示，不抛 `can't open file`。
3. 改动只碰插件内文件；改完跑 `node D:\DSH\qqbot\scripts\audit-plugins.mjs`，issues 必须为 0；热插拔回归通过。
4. `qq_sing` 的现有行为不变（仍按 `vocal_start` / `sections` 起唱）。
