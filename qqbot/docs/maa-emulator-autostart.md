# MAA 模拟器自动启停（MuMu Player 12）

目标：主人在 QQ 说一句要跑任务，鱼自己把 MuMu 起来、等 ADB 就绪、把窗口压到最小化，全程不弹窗、不抢焦点。

## 一、现在的行为

跑一次 MAA 任务（确认执行、或后台执行）时，插件先做一次环境门禁：

1. 读 maa-cli 的 `default.toml` 得到 `adb_path` 和 `address`（本项目是 `D:/ADB_tool/.../adb.exe` + `127.0.0.1:16384`）
2. `adb -s 127.0.0.1:16384 get-state`
   - `device` → 直接跑任务，什么都不动（约 0.3 秒）
   - 其它（`offline` / `absent` / 端口没开）→ 进入自动启动
3. 找 `MuMuManager.exe`：环境变量 `DSH_MUMU_MANAGER` → 覆盖配置 → adb 同目录推导 → 标准安装目录（`C:\Program Files\Netease\MuMu Player 12\nx_main\`）
4. `MuMuManager.exe control -v 0 launch`（实例 index 0，可用 `vmIndex` 改）
5. 每 500ms 轮询一次：枚举 MuMu 窗口调 `ShowWindow(hwnd, SW_MINIMIZE=6)`（不激活、不抢焦点）；每 1.5 秒查一次 adb，必要时 `adb connect`
6. 如果 MuMu 启动时把前台抢走了，就用 Alt 键合法解锁 + `SetForegroundWindow` 把主人原来那个窗口放回去（只在前台确实是 MuMu 时才动手，主人自己切走的窗口不动）
7. 等 `get-state` 变 `device` 才算成功，默认超时 180 秒
8. 任务照旧跑；窗口一直保持最小化，任务结束也不还原

实测（本机，2026-11-03）：冷启动到 adb 就绪 11~13 秒，窗口最小化成功，前台恢复到原窗口，控制台输出里没有报错。

## 二、为什么端口通了也还要查 adb

MuMu 在 Android 还没启动完时就已经占住 16384 端口，`adb devices` 显示 `offline`。原来的门禁只看端口是否监听，于是「模拟器没起完」会被判定为可用，任务跑下去直接失败。现在把 `get-state` 的结果也算进判断，`device` 才算可用。

对应地，`maa_doctor` 的 ADB 检查也会区分三种状态：端口没开（fail）、端口开着但设备 offline（warn）、设备在线（ok）。

## 三、失败时说什么

- `请手动启动mumu模拟器！` 后面会带具体原因（端口不通 / 端口通了但设备 offline）
- 自动启动失败（找不到 MuMuManager、超时、adb 不通）时，错误信息仍是上面那条，任务不会执行，确认计划保留、不消耗
- 关掉自动启动：环境变量 `DSH_MAA_AUTOSTART=0`

## 四、覆盖配置（可选）

`%USERPROFILE%\.dsh\maa-cli\emulator-launch.json`：

```json
{
  "managerPath": "C:\\Program Files\\Netease\\MuMu Player 12\\nx_main\\MuMuManager.exe",
  "vmIndex": 0,
  "serial": "127.0.0.1:16384",
  "timeoutMs": 180000,
  "minimize": true,
  "disabled": false
}
```

字段都可以不写，缺的走自动推导。`minimize: false` 只启动不最小化（调试用）。

## 五、改了哪些文件

插件目录：`%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-maa-cli\`

| 文件 | 改动 |
|---|---|
| `scripts/mumu-autostart.ps1` | 新增。纯 ASCII（PS 5.1 读无 BOM UTF-8 会把中文注释当 ANSI）。启动 MuMu、等 adb、最小化窗口、恢复前台，最后吐一行 JSON |
| `src/runtime/adb.js` | 新增。`adbDeviceState` / `adbConnect`，带超时、永不抛异常 |
| `src/runtime/emulator-autostart.js` | 新增。找 MuMuManager、读覆盖配置、串行化启动（并发调用共享同一次启动）、解析脚本 JSON |
| `src/runtime/emulator.js` | `checkEmulator` 增加 adb 设备状态判断；`emulatorErrorMessage` 区分「端口不通」和「设备 offline」 |
| `src/runtime/doctor.js` | MuMuManager 候选加标准安装目录；ADB 检查加设备状态 |
| `src/index.js` | 新增 `ensureEmulatorReady`：检查 → 不可用则自动启动 → 再检查；确认执行前和后台执行前各接一次；自动启动过就在执行摘要里加一行「模拟器已自动启动（N 秒，窗口已最小化）」 |

注意：这些是直接改在 `node_modules` 里的本地补丁。插件从 dshmarket 升级到新版本时会覆盖掉，升级后要按本文件重做（或报给上游）。

## 六、怎么验证

1. `MuMuManager.exe control -v 0 shutdown`（或直接关模拟器）
2. 让鱼跑任意一个 MAA 任务
3. 期望：模拟器起来、窗口看不到、adb 有 `127.0.0.1:16384 device`、MAA 正常跑完、执行摘要里带「模拟器已自动启动」
4. 不想要自动启动时：`DSH_MAA_AUTOSTART=0`

## 七、坑记录

- PS 5.1 里 `$null` 的时间表达式、`Get-Date` 的第一个调用曾经返回 null；本次脚本没有在 PS 里做时间比较以外的算术，计时用 `Stopwatch`
- `MuMuManager info -v 0` 的 `is_android_started` 不是可靠的“能连 adb”依据（会 false 但有端口），一律以 `adb get-state` 为准
- `SetForegroundWindow` 在后台进程里直接调用会返回 False，必须先 `keybd_event(VK_MENU)` 按一下再调，验完抬键
- `MuMuNxDevice`（标题「主线程」）和 `MuMuNxMain`（标题「MuMu模拟器」）两个窗口都要压，只压一个另一个还会跳出来
