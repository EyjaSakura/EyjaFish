# 交接提示词：QQ 遥控 MAA 跑明日方舟（当前现状，2026-11-02 17:30）

给 dsh 审阅。完整开发文档：`D:\DSH\qqbot\docs\maa-qq-control-prompt.md`（29 节）
本文只讲：现在到哪、哪些验过了、还差什么、下一步怎么走、坑在哪。

---

## 一、一句话现状

**洞已经打通到"能提权跑脚本 + 能调 MAA"这一步**：MAA 6.21.1 装好、计划任务 `DSH-MAA-Run`
按最高权限建好、`C:\MAA\runner` 已收紧 ACL、队列/参数校验/完整性/审计全部验过；
**只剩最后一步**——把改好 attach 参数的 worker 复制进受保护目录、重生成 baseline，
然后触发一次任务，验证"最小化 + 管理员 + PrintWindow/PostMessageWithWindowPos/SendMessage"能 attach 成功并截到画面。

## 二、目标与边界（不变）

- 主人在 QQ 说一句，小鲸鱼在本机把明日方舟 PC 端的事做掉
- **不复现识别**，执行体就是 MAA（C API attach），我们只做"桥 → 任务 → 回报"
- 只服务主人本人这台机器；v1 只做 `wakeup` / `mail` / `sanity`

## 三、已核实的事实

| 项 | 结论 |
|---|---|
| MAA 版本 | 6.21.1（旧版保留在 `C:\MAA-6.9.3-backup`，可回退） |
| PC 端机制 | 绑 Win32 窗口；截图 PrintWindow/FramePool/DXGI/WGC/GDI；输入 PostMessage/SendMessage/SendInput/Interception |
| **GUI 实测 attach 参数** | `screencap=16 (PrintWindow)`、`mouse=256 (PostMessageWithWindowPos)`、`keyboard=2 (SendMessage)`；来源 `C:\MAA\debug\gui.log`，同一 HWND、**最小化**状态下 return=true |
| 窗口状态 | **最小化是正确用法**（登录后先最小化再绑定，避免操作时窗口乱闪） |
| 分辨率 | 1280×720，16:9，满足要求；只有 MAA 报 UnsupportedResolution 才需要调 |
| C API 导出 | CreateEx/SetInstanceOption/LoadResource/AsyncAttachWindow/AttachWindow/AppendTask/Start/Stop/Destroy 全在（6.9.3 与 6.21.1 都验过） |
| AsstLoadResource | 传 `C:\MAA` → True；传 `C:\MAA\resource` → False |
| 权限 | 游戏是管理员跑的，脚本/MAA 必须管理员；非管理员 attach 必失败（GetLastError=5） |
| 计划任务 | `DSH-MAA-Run` 已建：LogonType=InteractiveToken、RunLevel=HighestAvailable、UserId=主人 SID（2026-11-02 主人核对） |
| runner ACL | 已收紧：SYSTEM(F)、Users(RX)、Administrators(F)，没有 Authenticated Users |
| 游戏启动 | 路径带空格，直跑 exe 会 `-2147024894`；用 `maa\tools\open-arknights.cmd` 包一层，任务触发能起来 |

## 四、已经做完的东西

### 4.1 提权侧（固定入口，不接 argv，受 ACL + baseline 保护）

```
C:\MAA\runner\
  run-job.ps1          DPI → 完整性校验 → 队列领取(.claimed) → 严格校验 → 起 worker → 审计
  stages.json          关卡白名单 + 单局理智 + 单局时长
  whitelist.json       任务/参数/上限白名单
  worker\run_job.py    执行体（已移入受保护目录，baseline 覆盖它）
  baseline.sha256      四个文件的 SHA256
  make-baseline.ps1    重新生成基线（只有主人能跑）
```

已实现：队列原子领取、4KB 上限、顶层/参数白名单、times 1~99、allowStone 必须 false、
stage 命中白名单、jobId 生成、审计按天 `audit-YYYYMMDD.jsonl`（2MB 滚动、带 paramsSha256/reqFile）、
同会话校验、管理员校验、锁屏检测、截图/失败留证位。

### 4.2 桥侧 / 工具

```
D:\DSH\qqbot\maa\tools\submit.mjs        原子写 queue\req-<seq>-<ms>.json（桥唯一写入口）
D:\DSH\qqbot\maa\tools\stage-worker.mjs  生成 worker 的 staging 副本（因为 runner 只读）
D:\DSH\qqbot\maa\staging\run_job.py      改好 attach 参数(16/256/2)的待入库版本
D:\DSH\qqbot\maa\tools\open-arknights.cmd 起游戏
D:\DSH\qqbot\maa\tests\attach_shot.py     只读 attach + 截图
D:\DSH\qqbot\maa\tests\load_probe.py      资源路径/导出台账
```

### 4.3 验收结果

| 编号 | 内容 | 结果 |
|---|---|---|
| P0 | 管理员 MAA GUI 绑窗口 + 开始唤醒 | **通过**（2026-11-02 17:04） |
| A1 | 计划任务属性 | **通过**：InteractiveToken / HighestAvailable / 主人 SID |
| A2 | 非登录会话应报"不在同一会话" | **暂缓**：要主人临时建 S4U 任务 |
| A3 | 最小化 + 管理员 + 16/256/2 → attach true + 截图可见 | **待复验**：等 worker 入库 + 重生成 baseline |
| B1 | 两条请求按序领取 | 通过 |
| B2 | 额外字段被拒 | 通过（`illegal top-level field: hack`） |
| B3 | 非法关卡被拒 | 通过（`stage not allowed: XY-1`） |
| C1 | 改 runner 脚本一个字节被拒 | 通过（`integrity mismatch`） |
| C2 | 恢复后正常 | 通过（IDLE） |
| C3 | 桥写 `C:\MAA\runner` 被拒 | **通过**：Access denied（ACL 收紧后复验） |
| D1 | 回报写"预计消耗" | 通过 |
| D2 | 降级路径写明 | 通过 |

## 五、现在卡在哪（只有一条）

**A3 复验**，需要主人以管理员跑三行：

```powershell
copy /y "D:\DSH\qqbot\maa\staging\run_job.py" "C:\MAA\runner\worker\run_job.py"
powershell -NoProfile -ExecutionPolicy Bypass -File C:\MAA\runner\make-baseline.ps1
schtasks /run /tn "DSH-MAA-Run"
```

跑完 `job.json` 和 `audit-*.jsonl` 会有新记录、`data\shots\` 会出截图；
截图能看见游戏画面（不是黑图）就算 A3 过。

## 六、ACL 的坑（已经踩过，务必记住）

- **错误写法**：`icacls ... /grant *S-1-5-32-544:(OI)(CI)F /T`
  —— `(OI)(CI)` 只对子对象生效，文件自己没有效 ACE，DACL 被清空后**连管理员都读不了**，
  表现就是任务 `Last Result=1`、脚本根本没执行（那次队列请求没被领走、审计无记录）。
- **正确写法**：`takeown` → `icacls /reset /T /C` → `/inheritance:r` →
  带 `(OI)(CI)` 给目录 → **再单独 `/T /grant ...:F`（不带 (OI)(CI)）** 显式给文件本身。
- 验证：`icacls C:\MAA\runner\run-job.ps1` 必须看到三行有效 ACE，不能空白。

## 七、ACL 之后的工作方式（重要）

`C:\MAA\runner` 对普通用户只读，鱼改不了里面的文件。以后任何改动都要：

1. 鱼在 `D:\DSH\qqbot\maa\staging\` 改好临时副本（worker 用 `node maa/tools/stage-worker.mjs` 生成）
2. 主人用管理员把文件复制进 `C:\MAA\runner\...`
3. 主人以管理员跑 `make-baseline.ps1` 重生成基线
4. 鱼再触发任务验收

## 八、下一步（A3 过之后）

1. **PostMessage 点击验证**：点"开始行动"，前后截图对比（这一步有真实游戏行为，要先跟主人确认）
2. **跑通最轻任务**（`wakeup` 或 `mail`），回调里能看到阶段推进
3. **ark_stop**：AsstStop → 10 秒 → 只杀自己 spawn 的 pid → 确认无残留
4. **锁屏守卫**：锁屏时暂停并回报
5. 以上全过（文档二十二节五条门槛）才接 QQ 工具面：
   `ark_status` / `ark_run {task,params}` / `ark_stop`，单任务队列 + 主人号限定

## 九、已知风险 / 未验证

- 封号风险：自动化可能违反游戏条款，最终主人决定
- 未验证：前台降级（SendInput）后坐标是否偏、锁屏/RDP 下截图行为、多显示器 DPI 125% 点击精度
  （当前系统 DPI 是 100%，125% 那条测试还没做）
- 资源跟不上时：卡在识别不到界面，靠"90 秒无进展判卡住"兜底
- 截图回传前裁右下 220×40 的 UID 区域；日志里 UID/昵称脱敏
- AGPL：进程调用不构成分发；改源码对外分发才触发义务

## 十、复现命令

```powershell
# 放一条请求
node D:\DSH\qqbot\maa\tools\submit.mjs --file <请求json>

# 触发提权任务
schtasks /run /tn "DSH-MAA-Run"

# 看结果
Get-Content D:\DSH\qqbot\maa\data\job.json
Get-Content (Get-ChildItem D:\DSH\qqbot\maa\data\audit-*.jsonl | Sort-Object LastWriteTime -Descending)[0] -Tail 3
Get-ChildItem D:\DSH\qqbot\maa\data\shots
```

请求 JSON 形如：
```json
{"task":"sanity","params":{"stage":"CE-6","times":3,"allowMedicine":false,"allowStone":false}}
```
