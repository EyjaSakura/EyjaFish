# MAA 模拟器方案：运行时与 maa-cli 参数笔记

写于 2026-11-03 12:35，dsh。PC 端方案已废弃，这里是模拟器 + maa-cli 的实测结论。

## 一、运行时位置（手动搭的，别再重装）

```
runtime 根目录   C:\Users\Eyjafjalla\.dsh\maa-cli\runtime
maa-cli 本体     runtime\bin\maa.exe            v0.7.7
核心库           runtime\data\lib\MaaCore.dll   v6.21.1
热更新目录       runtime\data\MaaResource\       （git init 过）
资源实体         runtime\data\MaaResource\resource\   （tasks、template、global…）
```

环境变量（用户级，已设）：

```
MAA_DATA_DIR   = C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data
MAA_CONFIG_DIR = C:\Users\Eyjafjalla\.dsh\maa-cli
```

关键坑：

- 资源必须放在 `MaaResource\resource\` 这一层，放 `MaaResource\` 根下 doctor 会判空
- `runtime\data\lib\resource` 里的资源是核心包自带的，不算“热更新资源”
- 安装包可以直接用官方 zip 手动解压，绕过 `maa install` 下载慢的问题
- `maa install` 卡在“解压”阶段时，多半是根文件没落盘，手动解压 zip 到 `data\lib` 即可

## 二、验证命令（都实测过）

```powershell
$env:MAA_DATA_DIR='C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data'
$env:MAA_CONFIG_DIR='C:\Users\Eyjafjalla\.dsh\maa-cli'
$maa='C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\bin\maa.exe'

# 看版本（应输出 maa-cli v0.7.7 / MaaCore v6.21.1）
& $maa version

# 启动游戏（必须带客户端类型和 ADB 地址）
& $maa startup Official -a 127.0.0.1:16384 --batch

# 刷 1-7 一次
& $maa fight 1-7 --times 1 -a 127.0.0.1:16384 --batch

# 全刷（不打完不返回，慎用）
& $maa fight 1-7 --series 0 --medicine 0 --stone 0 -a 127.0.0.1:16384 --batch
```

实测结果：

```
StartUp 1m 8s Completed
Fight 1-7 2m 10s Completed，掉落 固源岩×1、基础作战记录×1、龙门币×72
```

## 三、series 语义（重要）

`series` = 代理倍率（一次看录像刷几次），`times` = 奖励次数（打几局）。不传 `series` 默认 1。

源码 `FightTask.cpp`：

```cpp
const int series = params.get("series", 1);
// 新连战列表下允许 -1 ~ 10
```

核心逻辑 `FightTimesTaskPlugin::change_series_new`：

```cpp
int fight_times_remain = std::min(m_fight_times_max - m_fight_times, 10);
// 剩余次数与 10 取小；理智不够时按 target_times 降档
```

所以：

| 需求 | 参数 | 行为 |
|---|---|---|
| 刷 N 次 | `--times N --series 0` | 自动 10 + 余数（13 → 10+3） |
| 全刷 | 不传 `--times`，`--series 0` | 每批取剩余与理智的较小值 |
| 指定倍率 | `--series N`（1~10） | 固定倍率 |

实测（2026-11-03 12:27，24 理智、1-7 每次 6）：

```
fight 1-7 --series 0
→ sanity_cost: 24, series: 4   ← 自动降到 4，没有卡死
```

结论：**全刷写 `--series 0` 即可，不需要自己算次数**。

## 四、开放日（PRTS，按游戏 04:00 换日）

```
LS 经验    每天
CE 龙门币  周二、四、六、日
AP 红票    周一、四、六、日
SK 碳      周一、三、五、六
CA 技巧    周二、三、五、日
PR-A 医疗/重装  周一、四、五、日
PR-B 术师/狙击  周一、二、五、六
PR-C 辅助/先锋  周三、四、六、日
PR-D 特种/近卫  周二、三、六、日
```

MAA 资源里没有这张表，GUI 的灰色不可选是它自己算的，maa-cli 不会校验；请求不开放的关卡会失败。

## 五、模拟器

- 启动：`MuMuManager.exe control -v 0 launch`
- 路径：`C:\Program Files\Netease\MuMu Player 12\nx_main\MuMuManager.exe`
- ADB：`127.0.0.1:16384`（需要时 `adb connect 127.0.0.1:16384`）
- 窗口最小化后 MAA 照常工作（ADB 截图/点击不依赖窗口可见）
- 最小化脚本（不抢焦点）：

```powershell
Add-Type @"
using System;using System.Runtime.InteropServices;
public class WSh{ [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n); }
"@
Get-Process MuMuNxMain | ? { $_.MainWindowHandle -ne 0 } | % { [void][WSh]::ShowWindow($_.MainWindowHandle, 6) }
```

## 六、已知缺口

1. **运行中停止没接**：QQ 发“停”不会打断正在同步执行的 `maa fight`；插件有 `maa_runtime_instruction`，但当前链路没走后台执行。
   - 临时手段：直接杀 `maa.exe`（会打断当前战斗）
2. **busy-notice 重复**：桥里两处补丁同时发“在忙”，已在 `[busy-notice-any]` 加 `currentTurnInjected !== true` 去重（2026-11-03 12:30）
3. **资源更新**：`maa update` 走 GitHub，慢；资源可用就不更新

## 七、排查顺序

1. `maa version` 有没有核心版本
2. `maa dir library` / `maa dir hot-update` / `maa dir resource` 路径对不对
3. `adb devices` 有没有 `127.0.0.1:16384`
4. MAA 日志：`%APPDATA%\loong\maa\data\debug\asst.log`
5. 还不行就看 `runtime\state\debug\asst.log`（插件自己的日志）
