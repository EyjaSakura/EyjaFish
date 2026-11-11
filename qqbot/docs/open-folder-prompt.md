# 提示词：权限面板「打开目录」按钮的修复（交给 dsh 的交接说明）

## 你要知道的事

权限面板 http://127.0.0.1:8899 的人设卡里有个「打开目录」按钮，点它应该在资源管理器里打开
`D:\DSH\qqbot\personas`。这个功能已经修过一轮，**现在是好的**。这份文档是告诉你它现在的
实现方式、为什么这么做、以及改它的时候哪些坑不能踩。不要重写，除非要改需求。

## 原始故障（两个叠加）

1. **点了像没反应**。原来 server.mjs 里是
   `execFileSync('explorer.exe', [PERSONAS], { windowsHide: true })`。
   面板进程本身是从 `start-panel.ps1` 用 `-WindowStyle Hidden` 起的，子进程继承这个隐藏的
   STARTUPINFO，explorer 建出来的窗口 `Visible=False`。实测点五次，攒了五个看不见的窗口，
   一个都没显示。用 `Shell.Application` 枚举窗口才会发现它们确实存在。
2. **窗口能开但不会被顶到最前面**。用户点完，窗口可能开在别的窗口后面，得自己去找。

还有一个排查时踩到的坑：从隐藏的 node 进程里 `spawn('powershell.exe', ...)`，powershell 会
以 0 退出但**什么都没执行**（没有控制台 / STARTUPINFO 显示状态的问题）。所以不要用 powershell
做第一跳。

## 现在的实现（三个文件）

### 1. panel/server.mjs — 路由 `/api/open-folder`

```
POST /api/open-folder  body 可带 { path }
```

- 白名单：`/^(D:\\DSH\\qqbot|C:\\Users\\Eyjafjalla)\\/`，不匹配就回退到 PERSONAS。
- 用 `spawn('wscript.exe', ['D:\\DSH\\qqbot\\panel\\open-folder.vbs', safe],
  { detached: true, stdio: 'ignore', windowsHide: true })`，然后 `child.unref()`。
  wscript 是 GUI 子系统、没有控制台，不存在隐藏态继承的问题。
- 后端不等待结果，立刻回 `{ok:true}`；真正的成败在 vbs / ps1 里。
- 页面按钮（server.mjs 内联 HTML）：`<button class="ghost" onclick="openPersonaDir()">打开目录</button>`，
  JS 里 `openPersonaDir()` 只做 `POST /api/open-folder` 然后 log 一行。

### 2. panel/open-folder.vbs — 开窗 + 去重

- `Shell.Application.Explore path` 开窗。
- 开之前先枚举 `Shell.Application.Windows()`，把 `LocationURL` 归一化成 `d:/dsh/qqbot/personas`
  这种形式比对（`Mid(url, 9)` 去掉 `file:///`），**已经有了就不再开新窗**。重复点只做置前，
  不会堆出一堆同名窗口。
- 最后 `WScript.Shell.Run` 调 `foreground-folder.ps1`，`0, True`（隐藏窗口、等它结束）。
- 全 ASCII，别塞中文：VBS 用 ANSI 存，中文容易变乱码。

### 3. panel/foreground-folder.ps1 — 把窗口顶到前台

- 先用 `Shell.Application.Windows()` 按路径找 HWND，最多等 5 秒（explorer 可能还在建窗）。
  找不到 `exit 1`。
- 阶段一：真激活。`GetForegroundWindow` → `AttachThreadInput(前台线程, 本线程)` →
  `keybd_event` 模拟一次 ALT 按下抬起（解开前台锁）→ `ShowWindow(SW_RESTORE)` →
  `BringWindowToTop` + `SwitchToThisWindow` + `SetForegroundWindow`，最多 3 轮，每轮间隔 400ms
  用 `GetForegroundWindow` 验一次。
- 阶段二：兜底置顶。这台机器上有东西会在 1~2 秒后把前台抢回去，光靠 z-order 抬升会输，
  所以 `SetWindowPos(HWND_TOPMOST)` 钉住。已激活的钉 3 秒；没激活的钉到用户点它为止，最长 12 秒。
  最后 `HWND_NOTOPMOST` 放掉，不做常驻置顶。
- 退出码：`0` 已激活，`1` 没找到窗口，`2` 没抢到焦点但已置顶。
- 全 ASCII，PowerShell 5.1 读无 BOM 的 UTF-8 会当成 ANSI，中文注释会把脚本弄死。
- 日志写 `D:\DSH\qqbot\logs\foreground.log`（每次运行重置）。

## 实测过的结果

- 点按钮：前台从浏览器窗口变成「personas - 文件资源管理器」，ps1 退出码 0。
- 重复点：不再新开窗，只把已有的顶上来。
- 日志能看到目标 HWND、当前前台窗口名、每次 attempt 的结果。

## 改它的时候注意

- **别在调试里循环调用这个接口**。每调一次都会真的把用户当前的窗口抢走，之前排查时被误认成
  「窗口自己乱开乱关」——其实是测试脚本每七八秒打一次。测一次，看日志，别写 while 循环。
- 这个功能依赖「GUI 会话 + 交互式桌面」，远程或服务会话下前台 API 无效，只能置顶。
- 不要改回 `execFileSync('explorer.exe')`，隐藏态继承的问题会回来。
- 只重启面板就够：`D:\DSH\qqbot\panel\start-panel.ps1`（任务计划 `DSH-Panel-Restart`），
  不需要动 web / 桥。
- 改动后自检：`node --check D:\DSH\qqbot\panel\server.mjs`；vbs 用 `cscript //nologo` 跑一遍；
  ps1 用 `powershell -NoProfile -ExecutionPolicy Bypass -File` 跑一遍看退出码。
