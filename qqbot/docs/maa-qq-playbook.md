# MAA · QQ 侧执行手册（2026-11-03 起）

## 一、确认流程（替代确认码）

命令通道没接通，所以按这个来：

1. 我先把计划说清楚：任务、关卡、次数、预计理智、用不用药/碎石
2. 主人回复「确认」（或直接说「跑吧」）
3. 我再执行，不再要确认码
4. 执行完报：耗时、次数、掉落（MAA summary 里的原文）

没有「确认」两个字，一律不跑会消耗理智的任务。

## 二、端口（动态，别写死）

MuMu 重启后 ADB 端口会变（16384 → 16385 → …），固定端口不可靠。每次跑任务前：

1. `MuMuManager.exe adb -v 0` → 读 `{ adb_host, adb_port }`
2. `adb connect 127.0.0.1:<adb_port>`
3. 确认 `adb -s 127.0.0.1:<port> get-state` 是 `device` 再用

工具：
- Node：插件里的 `syncMumuEndpoint()`，每次执行前自动把 `default.toml` 的 `address` 改成当前端口
- PowerShell：`D:\DSH\qqbot\maa\tools\mumu-adb.ps1 -UpdateConfig`，输出 `host:port` 并同步配置

## 三、语义（按「奖励次数」理解）

- 「刷 N 次 X」→ `--times N --series 0`（MAA 自己拆 10 + 余数，比如 13 → 10+3）
- 「全刷 X」→ 不带 `--times`，`--series 0`
- **默认永远带 `--series 0`**，不要传 1

```
maa fight <关卡> --times <N> --series 0 --medicine 0 --stone 0 -a 127.0.0.1:<adb_port> --batch
maa fight <关卡> --series 0 --medicine 0 --stone 0 -a 127.0.0.1:<adb_port> --batch
```

- `--times` 不写 = 无限（help 原文：Exit after fighting given times, default to infinite）
- `--series 0` = 自动选当前能连打的最大次数
- 默认不吃药、不碎石
- 跑完用 summary 里的总次数和掉落回报

运行时环境变量：

```
MAA_DATA_DIR=C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data
MAA_STATE_DIR=C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\state
MAA_CACHE_DIR=C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\cache
MAA_CONFIG_DIR=C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\config
可执行：C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\bin\maa.exe
```

## 三、材料 → 关卡映射

- 龙门币 → CE-6（单局 36 理智）
- 经验 / 作战记录 → LS-6（单局 36 理智）
- 红票 / 采购凭证 → AP-5（单局 30 理智）

## 四、开放日

游戏数据里没有「哪天开放」这张表，MAA 资源也没有；GUI 是自己算的。
本地已存了 `D:\DSH\qqbot\data\gamedata\`（zone_table.json / stage_table.json，来自 ArknightsAssets/ArknightsGamedata），能查到关卡所属周回区（CE=weekly_9、LS=weekly_7、AP=weekly_5），但同样没有开放日。

处理方式：

- 常驻表（按惯例，遇到 MAA 报找不到入口就说明当天没开）：
  - CE 龙门币：周二、周四、周六、周日
  - LS 经验：周一、周四、周六、周日
  - AP 采购凭证：周一、周二、周五、周六
  - CA 技巧概要：周三、周六、周日
  - SK 碳：周一、周三、周五、周六
- 当天没开：换成同材料当天开放的关卡；同材料都没开就告诉主人，不硬跑

## 五、报告格式

跑完一条三行：

```
<任务>：耗时 X 分 X 秒，共 N 局
掉落：<summary 原文>
状态：完成 / 失败（原文报错）
```

## 六、已知问题

- QQ 里发 `/maa confirm 码` 到不了插件（命令通道没接上），所以走上面的「回复确认」
- 插件的 `maa_stage_schedule` 依赖 Node 的 fetch，本机 Node 访问外网失败（PowerShell 正常），所以拿不到开放日；需要的话后面改成 PowerShell 取数
- **长任务输出要落盘**：2026-11-03 12:20 那轮 TL-9 全刷，进程是被主人手动结束的（退出码 -1），maasummary 没写出来，只数到 7 次结算。以后全刷照样把 stdout 重定向到日志文件，另外跑之前先记一次时间，掉数据好在日志里数战斗
- 全刷前确认游戏在主界面；停在标题页（START）时 Fight 会直接 `Fight Error`，先跑一次 startup 再打

