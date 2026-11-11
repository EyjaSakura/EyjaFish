# 验证报告：抖音推荐流（douyin_feed）超时问题单

> 验证对象：小鲸鱼提交的《抖音推荐流问题单》
> 验证时间：2026-11-07
> 验证方式：日志比对 + 源码静态走查 + 进程/文件状态检查

## 结论

问题单**基本成立**：现象、日志证据、涉及文件、代码位置都对得上，私信链路正常的判断也正确。

但**根因定位有一处关键偏差**：不是「页面被外部关掉/context 被回收」，而是 `captureFeed` 自己在 `finally` 里 `close()` 了页面，随后兜底逻辑又用这个已关闭的页面 `goto`，必然抛出 `Target page, context or browser has been closed`。也就是说这是**代码自伤，不是抖音或浏览器的问题**，而且只要关注流为空就 100% 复现。

## 逐条核对

| 问题单说法 | 验证结果 | 证据 |
|---|---|---|
| 调 douyin_feed 返回「刷推荐流超时（抖音没响应）」 | ✅ 成立 | `features/contacts/identity.js:89` 确实返回该文案；等待 120 秒后超时 |
| 反复重试都一样 | ✅ 成立 | 日志 `cmd ok=0`、`cmd fail=2`，两次都失败，从未成功 |
| 私信发送、私信轮询正常 | ✅ 成立 | 日志 21:33:23Z / 21:33:29Z 仍有 `peer open` / `peer ok` |
| 日志两行 `cmd fail: page.goto...closed` | ✅ 成立 | `douyin-watch.log` 第 4420 行（17:30:30.943Z）、第 7215 行（18:56:38.415Z），与 01:30 / 02:56 本地时间对应 |
| `captureFeed` 从第 133 行起 | ✅ 成立 | `douyin/dm-watch.mjs:133` |
| 第 135 行 `ctx.newPage()` | ✅ 成立 | 行号完全一致 |
| 第 138 行 `goto('/follow')` | ✅ 成立 | 行号完全一致 |
| 第 146 行 `finally { p.close() }` | ✅ 成立 | 行号完全一致 |
| 147~156 行兜底 `/hot` 不在 try 里 | ✅ 成立 | 确实在 `finally` 之后、try 之外 |
| 兜底抛错导致桥侧只看到超时 | ✅ 成立 | `dm-watch.mjs:517` 的 catch 只 `log('cmd fail: ...')`，**不写 dm-results.jsonl**；桥侧等满 120s 后报超时 |
| appendFileSync 三处缺 import，已修 | ✅ 成立 | `identity.js:2` 已包含 `appendFileSync`；`identity.js:71` 正常写 `dm-commands.jsonl` |
| probe 残留可删 | ✅ 成立 | `profile-probe\`、`probe-feed.mjs`、`probe-follow.png`、`probe-hot.png` 都存在 |
| 不是验证码 | ⚠️ 无法独立复验 | 副本登录态确实会失效（App-Bound Encryption 与 profile 路径绑定是已知行为），但「主实例关注流是否真的空白」没有直接证据 |

## 关键修正：真正的抛出点

`captureFeed` 的实际执行顺序：

```js
const p = await ctx.newPage()          // 135
try {
  await p.goto('/follow', ...)          // 138
  ... 抓取 ...
} finally { await p.close() }           // 146  ← 页面在这里被关掉
if (vids.length === 0) {                // 147
  await p.goto('/hot', ...)             // 148  ← 对已关闭的 p 再 goto，必抛
}
```

所以错误信息里的「browser has been closed」指的是**自己刚关掉的那个 page**，不是外部把浏览器关了。

时间线也对得上：

- 17:30:20.969Z 私信轮询 `peer ok`
- 17:30:30.943Z `cmd fail`
- 中间约 10 秒 ≈ `goto /follow` + `waitForTimeout(6000)` + 两次滚轮 `2×1200ms`，正好是走完 `try` 块、关页、进入兜底后立刻抛错

## 触发的必要条件

只有当 `/follow` 抓到 0 条视频时才会进兜底，才触发这个必崩路径。所以：

- 关注流有内容 → 不会触发（但日志里 `cmd ok=0`，说明两次都是空）
- 关注流为空 → 100% 失败，且每次都要等 120 秒超时

## 建议修法（按优先级）

1. **把 `p.close()` 移到函数最后**：`try` 里只抓取，兜底 `/hot` 也在 page 存活期间完成，最后统一 `finally close`
2. 兜底 `/hot` 用 `newPage()` 重新开一页，或复用同一页但不提前关
3. `newPage` / 两次 `goto` 全部包进 `try/catch`，`/follow` 失败直接降级 `/hot`，不要向外抛
4. catch 里写 `dm-results.jsonl`：`{id, ok:false, reason:'page closed'}`，桥侧才能报真实原因
5. 失败时存一张截图（probe 那种），排查成本低很多
6. 顺手删掉 4 个 probe 残留

## 修复与实测（2026-11-07）

已改 `dm-watch.mjs`：

1. `captureFeed` 改成「每次抓取单独开页、单独关页」，`close` 不再早于兜底
2. `/follow` 和 `/hot` 各自 try/catch，失败降级而不是抛出
3. 两条都空时抛 `feed empty (原因)`
4. 命令 catch 里补写 `dm-results.jsonl`：`{id, ok:false, reason}`
5. 删掉 4 个 probe 残留

实测：

```
注入命令：feedtest-1794000941042（count=5）
结果：{"videos":[5条]}   日志：feed 5
QQ 端到端：douyin_feed count=3 → "刷到 3 条" + 3 个链接
```

结论：推荐流恢复。注意 `/follow` 仍为空（账号没关注人），实际走 `/hot` 热榜兜底；要真正的关注流需要先关注几个账号。

## 深层原因（补充，2026-11-07 06:00）

小鲸鱼说「账号已有关注的人」是对的——关注流里确实读到了已关注账号的视频（@广东人）。真正原因有三层：

1. **页面生命周期**：`finally { p.close() }` 早于兜底 `/hot`，复用关闭页必抛（已修）
2. **选择器错**：关注流不是 `<a href="/video/">`，而是 `div[data-e2e="feed-item"]`，视频 id 在 `[data-e2e="feed-active-video"]` 的 `data-e2e-vid` 上。原来的 `querySelectorAll('a[href*="/video/"]')` 在关注流上恒为 0（已修）
3. **Swiper 只渲染当前卡**：关注流是上下滑的 swiper，初始 DOM 里只有 1 张卡带 id；独立探测里「点击视频区 + wheel / 方向键」能翻页，但在 watcher 的抓取流程里翻页没有生效，只能拿到 1 条

当前策略：某来源少于 3 条就跳过。修复后的实测：

```
feed debug [follow] got 5 want 5
feed source follow
→ 5 条，全部来自已关注账号（@广东人、@什么都沾的星垣矢人、@Michael大麦哥…）
```

翻页方式：进入页面后先点一下视频区（让焦点落在播放器），之后每轮 `mouse.wheel(0,1000)` + 等 2.5 秒，swiper 就会切到下一张卡；每轮提取一次并去重。

关于「推荐流」：`https://www.douyin.com/?recommend=1` 和 `/recommend` 都会跳到「验证码中间页」，0 条内容。这是抖音对首页推荐的风控，和代码无关；当前只能稳定拿到**关注流**，热榜是兜底。

## 结论（最终，2026-11-07 07:00）

| 入口 | headless | headed（有窗口） |
|---|---|---|
| 推荐流 `/?recommend=1` | ❌ 验证码中间页 | ✅ 5/5 条 |
| 关注流 `/follow` | ✅ 5/5 条 | ✅ 5/5 条 |
| 热榜 `/hot` | ✅ 30 条 | ✅ 30 条 |

关键发现：**验证码不是一次性的 cookie 问题，而是无头模式被识别**。你手动在真窗口过完验证码后，headless 仍然拿不到推荐流；把 `dm-watch` 的浏览器切成 `headless: false` 后，推荐流立刻 5/5。

因此最终配置：`dm-watch.mjs` 用 headed 模式启动 Chrome（窗口移到屏幕外/最小化），推荐流优先，关注流次之，热榜兜底。

```
feed [recommend] 5/5
→ 内容来自不同创作者（@全员不在状态、@坦克世界、@可爱者甚凡、@毕导、@火山引擎）
```

代价：多一个可见的 Chrome 进程（约 200MB 内存）；不要手动关它，watcher 会自己重开。若推荐页再次弹验证码，重复「停 watcher → 开真窗口过验证 → 重启 watcher」即可。

## 其他观察

- `dm-commands.jsonl` 当前不存在——命令被消费后会删除/清空，属正常；但这也意味着失败时没有留痕
- 旧日志 `douyin-watch.log.old-20261106` 已在清理中删除，但当前 `douyin-watch.log`（4 MB）保留了这两条失败记录
- `dm-results.jsonl` 目前只有 analyze 结果，没有任何 feed 结果，和「从未成功」一致
