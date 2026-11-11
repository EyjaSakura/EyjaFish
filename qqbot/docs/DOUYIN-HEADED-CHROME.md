# 抖音有头 Chrome 崩溃：根因与修复

## 现象

- 有头模式（headless: false）下，watcher 每约 20 秒报一次 `[ctx-health] browser gone, reconnecting`
- headless 完全稳定
- 手动用同样参数打开 Chrome 却稳定 60 秒以上

## 排查过程

1. 排除 profile 损坏：真实 profile 确实坏过，重建后手动有头稳定（见 `profile-backup-20261107`）
2. 排除 Chrome 版本：系统 Chrome 156 与 Chrome for Testing 155 表现一致
3. 排除启动方式：`launchPersistentContext`、detached + CDP、计划任务、用户双击 VBS 都一样
4. 加检查点定位：崩溃发生在**空闲期**，不是操作中
   - 最后一个检查点：`dump done`
   - 6 秒后：`ctx-health`

## 根因

每个 peer 处理完会执行：

```js
finally { await page?.close() }
```

`openPeer` 复用的是 `ctx.pages()[0]`。如果那是**最后一个标签页**，有头 Chrome 会随之关闭窗口并退出浏览器；headless 不会。

这也解释了为什么手动测试稳定——手动测试没有关掉最后一个页面。

## 修复

在关闭页面后、以及每轮循环开始时保活一个空页：

```js
finally {
  try { await page?.close() } catch { }
  try { if (ctx && ctx.pages().length === 0) await ctx.newPage() } catch { }
}
```

```js
log('cycle start')
try { if (ctx.pages().length === 0) await ctx.newPage() } catch { }
```

## 验证

- 有头 Chrome 连续运行 5 分钟以上，无 `ctx-health`
- Chrome 进程稳定（11 个），窗口停留在一个 `about:blank` 保活页
- 推荐流：`feed [recommend] 5/5`，5 条不同创作者

## 当前运行配置

- 浏览器：`D:\DSH\qqbot\douyin\cft\chrome-win64\chrome.exe`（Chrome for Testing 155）
- profile：`D:\DSH\qqbot\douyin\profile-cft`（已登录，9 个会话）
- 启动：`dm-watch.mjs` 自己拉起有头 Chrome（headless: false）
- 保活页：每个周期保证至少一个页面存在

## 遗留

- 排查用的旧 profile、CfT 安装包、探针脚本已清理（douyin 目录 2.61 GB → 1.08 GB）
- `start-douyin-headed.vbs` 保留，作为手动重启入口
