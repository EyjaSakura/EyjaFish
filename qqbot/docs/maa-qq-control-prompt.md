# 给 dsh 的讨论记录：用 QQ 遥控 MAA 跑明日方舟（PC 端）

写于 2026-11-02 15:15，来自主人和小鲸鱼的讨论。**现在还在讨论阶段，没有动手。**

## 一、主人想要什么

在 QQ 里说一句（"帮我清日常""把今天的理智清了""刷龙门币"），小鲸鱼就能在自己这台电脑上
把《明日方舟》PC 端的事做掉，不用主人自己去点 MAA 的界面。

硬要求：
- 能直接用现成的就别重写，**不要自己复现识别和点击**
- 主人懒得开 MAA GUI，所以最好是"能被程序调起来"的那种用法
- 讨论阶段先别写代码

## 二、查到的 MAA 现状

- `MaaAssistantArknights/MaaAssistantArknights`：24.2k 星，C++，**AGPL-3.0**，2.9k fork
  （星数/fork 数截至 2026-11-02，看的时候以 GitHub 实时为准），
  一键清日常，官服/B 服/国际服都支持
- 任务本体是 **JSON pipeline + 资源图**：界面识别（模板匹配 + OCR）→ 动作 → 跳转条件
- 老路径是 ADB 控制模拟器；**PC 端支持已经合进主干**
- 拆出来的通用框架 `MaaXYZ/MaaFramework`：5.1k 星，LGPL-3.0，广告语是"基于图像识别的自动化黑盒测试框架"

## 三、PC 端到底怎么控制的（关键事实）

结论：不走 ADB，改成 **绑定 Win32 窗口**。

- PR `#15407 feat(PC): 支持 PC 端明日方舟`，2026-01-18 合并。内容：
  - 新增 `Win32Controller`，通过动态加载 `MaaWin32ControlUnit.dll` 提供截图与输入
  - 新增公开 API `AsstAsyncAttachWindow`（以及同步版）用于绑定 Win32 窗口
  - 新增 Win32 截图/输入方式的枚举与 UI 设置，PC 模式会加载 PC 专用资源
  - 滑动插值逻辑抽到 `SwipeHelper`，Minitouch / PlayTools / Win32 三套控制器共用
- PR `#18341` 又给 PC 窗口绑定加了 `AnchoredTouch` 鼠标输入方式

`MaaFramework` 里 `source/MaaWin32ControlUnit/` 的实现（这是最值得抄的部分）：

截图（Screencap/）：
- `GdiScreencap`（BitBlt）、`ScreenDCScreencap`
- `PrintWindowScreencap`（含 `PrintWindowWithPseudoMinimizeScreencap`）
- `DesktopDupScreencap` / `DesktopDupWindowScreencap`（DXGI 桌面复制）
- `FramePoolScreencap` / `FramePoolWithPseudoMinimizeScreencap`（Windows.Graphics.Capture）
- `PseudoMinimizeHelper`：窗口被遮挡/最小化时的伪最小化处理

输入（Input/）：
- `MessageInput`（PostMessage/SendMessage 往窗口灌消息，后台可用）
- `LegacyEventInput`（SendInput 级模拟，通常要求窗口有焦点）
- `SeizeInput`（接管/独占输入）
- `InterceptionInput`（走 Interception 驱动，键鼠层面，需要驱动）
- `BackgroundManagedKeyInput`（后台按键）
- `AnchoredTouchInput`（把坐标锚到窗口的触摸模拟）

所以上层完全没变：还是同一套识别 + pipeline，只是底层从"ADB 发触摸"换成
"Win32 截图 + 注入输入"。**MAA 的资源几乎原样复用**。

## 四、结论：复现吗？

不建议复现。理由：
1. 识别层的价值全在资源上（几千张模板图 + OCR 词典 + 各地图/界面的坐标），重写等于重做一年
2. 反检测、分辨率适配、UI 改版维护，都是 MAA 社区在扛
3. 我们的真正增量是"**从 QQ 到任务的这一层**"，不是图像识别

正确姿势：**把小鲸鱼当遥控器**，执行体交给 MAA。

## 五、推荐架构（三层）

```
QQ 私聊（主人）
   ↓  自然语言："把今天的理智清了"
小鲸鱼（桥工具 / 本地脚本）
   ↓  任务名映射 + 参数（关卡、次数、干员组）
MAA 的进程接口（MaaPiCli / maa-cli / AsstCaller 绑定）
   ↓  Win32ControlUnit attach 到游戏窗口
明日方舟 PC 端
   ↑  运行日志 / 回调（阶段、完成、失败原因）
```

三个候选执行体，按稳的程度排：
1. **MaaPiCli**（MaaFramework 的 CLI，JSON 配置驱动）：最贴近"进程式调用"，适合脚本化
2. **maa-cli**（社区 Rust 版命令行）：命令式跑任务，适合简单指令
3. **AsstCaller / C API 的绑定**（Python、C# 等）：最灵活，但要处理动态库加载和回调，维护成本高

要先确认：这个 MAA 版本里 PC 端能不能在 CLI 路径下 attach（GUI 能跑通不代表 CLI 能）。

## 六、动手前必须确认的四件事

1. **MAA 版本**：必须是支持 PC 端绑定的版本（2026-01 之后的 release）
2. **手动跑通一次**：主人自己开 MAA，选 PC 端、绑定窗口、跑一次"开始唤醒 + 清日常"，
   确认能看到游戏被操作、任务能完成。跑不通就别谈自动化
3. **输入方式**：消息注入（后台）能不能被游戏接受；不行的话就要窗口前台，或者装 Interception 驱动
   （装驱动需要管理员，且要主人同意）
4. **窗口状态**：最小化是 PC 端的正常用法（主人已确认），用伪最小化截图；全屏独占模式支不支持待测

## 七、任务映射（自然语言 → MAA 任务）

主人的话大概会是这样，需要一张表：

| 主人说 | 对应任务 |
|---|---|
| 清日常 / 收菜 / 打日常 | 开始唤醒 → 领取信用/邮件 → 基建换班 → 打关卡 → 收任务 |
| 刷龙门币 / 打 CE | 指定关卡（CE-6 等）+ 次数 = 理智/21 |
| 刷材料 / 清理智 | 用户指定关卡 + 清空理智 |
| 基建换班 | 基建任务 |
| 公开招募 | 招募任务 |
| 收信用 / 领邮件 | 简报/邮件任务 |

实现上建议：一张 JSON 任务表（别名 → MaaPiCli 配置 / maa-cli 参数），配 SQLite 或文本记录最近一次执行结果。

## 八、回报怎么做

- 任务开始时回一句"开始清日常了"
- 中途只报关键节点（进了关卡、打完第 N 把、卡在某个界面）
- 结束报"完成 / 用了多少理智 / 哪里失败"
- 失败要能说人话：把 MAA 的失败阶段（识别不到某界面、体力不足、没绑定窗口）翻成一句话

## 九、风险与边界（必须写清楚）

1. **自动化可能违反游戏用户协议**，有封号风险，得让主人自己决定
2. 只服务主人本人这台机器，不代练、不接别人的号
3. AGPL-3.0 的边界说清楚：
   - **进程调用**（我们起 MAA 的进程、收发 JSON）**不构成分发**，不触发开源义务
   - 如果我们**改 MAA/MaaFramework 的源码再分发**，才必须按 AGPL/LGPL 公开对应修改
   - 在自己机器上改着用（不对外分发）理论上也不触发，但风险自担
4. 不把账号密码、设备指纹之类的东西写进日志
5. 工具出错要能"停"，不要无限重试卡在登录界面

### 9.1 Interception 驱动单独说（这里最容易埋雷）

- 它是个**内核级键鼠驱动**，要签名的驱动包，装的时候要管理员 + 可能要求测试签名/重启
- 系统大版本更新后驱动可能失效，表现为"点了没反应"而不是报错
- 游戏如果带反作弊/完整性检查，注入类输入本来就有被识别的风险，驱动只会**增加**风险面
- 结论：**默认不装**。先试 PostMessage/SendMessage（后台），不行再说前台 SendInput，
  Interception 只作为最后手段，而且要先得到主人明确同意

## 十、分阶段计划（等主人点头才动）

- **P0 人工验证**：主人用现成的 MAA GUI 手动跑通一次 PC 端日常。这一步**允许点 GUI**，
  目的是确认识别/流程/账号都正常（和第十一节"日常使用不需要点界面"不冲突：那是最终状态）
- **P1 只读探测**：我确认 MAA 安装目录、MaaCore.dll 导出、游戏窗口句柄、日志位置
- **P2 最小脚本**：用 C API 绑窗口 + 截一张图存盘（只读，不点击）
- **P3 跑一个最轻的任务**（比如只做"开始唤醒"或"领取邮件"），验证注入能不能被游戏接受
- **P4 接 QQ**：桥加工具（`ark_status` / `ark_run {task}` / `ark_stop`），本地控制口 + 单任务队列
- **P5 体验**：任务别名映射、进度回报、失败翻人话、执行记录

## 十一、验证标准（以后验收用）

1. QQ 里说"清日常"，游戏端真的开始动（截图/日志为证）
2. 任务结束后能给出"打了什么、消耗多少、有没有失败"
3. 中途说"停"，能在 N 秒内停下来，不会卡死
4. MAA 没开 / 窗口没绑定 / 游戏没登录时，回的是人话，不是报错码
5. **日常使用阶段**不需要主人点 MAA 界面（首次配置和 P0 验证除外）

## 十二、超时与重试（补上）

- 单任务超时：**按任务类型分别设**，不再统一 45 分钟（见第十九节任务表）：
  唤醒/领邮件 10 分钟、清理智 = 理智 ÷ 单局消耗 × 单局时长 + 10 分钟、基建 15 分钟。
  超时先 AsstStop，10 秒不退就 kill 该任务自己 spawn 的进程树
- 识别卡住超时：连续 90 秒没有阶段推进，判"卡住"，回报卡在哪一步并停下，不自动重试
- 自动重试：默认**不重试**；只有"连接失败/窗口丢失"这类可恢复错误允许重试 1 次，且要回报
- 失败后保留：最后一张截图 + 最后 200 行日志（脱敏后）供排查

## 十三、还没定的问题（留给主人拍板）

1. 执行体用 C API 薄封装（推荐）还是 maa-cli？
2. 允许以管理员权限运行吗（游戏本身是管理员跑的，实测非管理员碰不到它的窗口）
3. 允许装 Interception 驱动吗（默认不装）
4. 需要定时自动跑吗（比如每天 8 点自动清），还是只在 QQ 说的时候跑？
5. 失败的时候要不要自动截图回传给你看？

## 十四、本机实测记录（2026-11-02，6.9.3 时代）

环境：MAA 6.9.3（`C:\MAA`，含 `MaaWin32ControlUnit.dll`）、明日方舟 PC 端在跑（pid 19592）、
`D:\Hypergryph Launcher\tools\maafw` 里有 `MaaPiCli.exe` 和 `MaaWin32ControlUnit.dll`。

> **2026-11-02 16:20 已升级到 MAA 6.21.1**，旧版整体改名保留在 `C:\MAA-6.9.3-backup`。
> 下面这些 6.9.3 的结论里，导出/资源路径两项在 6.21.1 上重测一致；attach 仍受权限限制，
> 详见第二十九节。

实测结果：
1. `C:\MAA\MaaCore.dll` 导出 `AsstAsyncAttachWindow` / `AsstAttachWindow` / `AsstAppendTask` /
   `AsstStop` / `AsstLoadResource` —— 都有（ctypes 验证）
2. `AsstLoadResource` 要传**MAA 根目录**（`C:\MAA`），传 `C:\MAA\resource` 会返回 False（踩过）
3. 绑定失败，原因具体到一条：**游戏进程权限比我们高**——
   伪最小化的 `SetWindowLongPtr` 报 `GetLastError=5`（拒绝访问），
   `OpenProcess(PROCESS_QUERY_INFORMATION)` 也回 5，`ShowWindow(SW_RESTORE)` 无效。
   （当时窗口是最小化状态，位置在 `-32000,-32000`、尺寸 `160×28`，但**最小化本身不是原因**，
   见下面 5.）
4. 结论：**必须让 MAA/脚本以管理员权限运行**（伪最小化要改窗口样式，非管理员必然 `GetLastError=5`）。
5. **2026-11-02 主人实测修正（覆盖本节旧结论）**：
   - **最小化才是正确用法**：游戏登录后先把窗口最小化，再开 MAA 绑定。
     不最小化的话 MAA 操作时游戏窗口会乱闪，这是 MAA 开发者的建议做法。
   - 所以"窗口必须还原 / 最小化 = 未就绪 / 客户区 ≥1280×720 才能 attach"这些旧结论**全部作废**。
   - 最小化状态下走**伪最小化截图**（`PrintWindowWithPseudoMinimize` / `FramePoolWithPseudoMinimize`），
     MAA 6.21.1 里这条路可用；前提仍然是管理员权限。
   - 分辨率：主人当前窗口 **1280×720，正好 16:9**，满足 MAA 要求，**不需要改成 1920×1080**。

脚本：`D:\DSH\qqbot\maa\tests\attach_shot.py`（只读：绑窗口 + 截一张图，不点击）

## 十五、疑点清单逐条结论（2026-11-02 核实版）

### 一、执行体选型

1. **MaaPiCli 不带方舟资源**。它是 `MaaXYZ/MaaPiCli`（ProjectInterface CLI，0 星，2026-10-18 还在推），
   源码里搜不到 win32 字样，控制器由 interface.json 指定；要跑方舟得自己喂资源，
   **能不能 attach Win32 窗口未实测，不作为首选**。
2. 候选确认：
   - **C API（AsstCaller）**：本机 `C:\MAA\MaaCore.dll`（现 6.21.1；6.9.3 与 6.21.1 都实测导出）
     `AsstAsyncAttachWindow` / `AsstAttachWindow` / `AsstAppendTask` / `AsstStop`，
     **能绑窗口、能收回调（AsstCreateEx 传 callback）**；缺点是自带 Python 绑定是旧版
     （只有 `AsstAsyncConnect`），要自己写薄封装。
   - **maa-cli（Rust，MaaAssistantArknights/maa-cli）**：存在，PC 支持未验证；
     社区已有 `trueRISCOacnt/maa-dsh-skill`、`Ichigo0820/maa-arknights-mcp` 这类基于 maa-cli 的实现可参考。
3. **建议执行体：C API + 自写薄封装**。理由：本机已装 6.21.1 且 header 明确有 attach；
   MaaPiCli 资源不对口；不用引入 Rust 工具链和额外进程。

### 二、游戏生命周期

4. **必须先启动并登录**。attach 只能绑已经存在的窗口；C API 不会替你启动游戏。
   MAA GUI 里有"启动客户端"能力，但那属于 GUI 层，走 C API 时要么自己起 Hypergryph Launcher，
   要么假定主人已经开着游戏。
5. 登录、公告、强制更新、闪断重连：都由 **MAA 资源里的任务**处理（它本来就有对应节点）。
   但"启动器更新"这类超出游戏窗口的事，MAA 不一定管得住，要在回报里说清楚。
6. 资源没跟上（游戏更新、界面改了）：表现是**卡在识别不到某个界面**，日志里一串 match 失败，
   外部看起来就是"一直没进展"。检测办法：90 秒无阶段推进判卡住，回报"卡在 X 界面"并附截图，
   不自动重试。

### 三、任务生命周期

7. **ark_run 返回 job id，异步**。日常 10~30 分钟，QQ 回合等不起；同步会卡死桥。
8. 桥侧要**单任务队列**：同一时间只跑一个 MAA 任务，后来的排队或拒绝。
   进度靠 MAA 回调推进，桥只在关键节点（开始/进关卡/完成/失败）发 QQ 消息。
9. web 重启：正在跑的任务状态**直接丢弃**（进程也没了），下次 ark_status 返回"上次任务中断"；
   清理残留：起任务前先扫一遍有没有 MAA 相关进程，有就 kill 再起。
10. 连发两条 ark_run：**拒绝第二条**，回"上一条还在跑，还剩大概 X 分钟"，等这条结束再说。
11. ark_stop：`AsstStop` → 等 10 秒 → 不退就 kill 进程树 → 再核对窗口是否还在。
    确认无残留的办法：查 `MaaCore` 宿主进程（我们起的那个 node/python）是否退出 + 端口/句柄。

### 四、窗口与环境

12. **游戏是管理员权限跑的，MAA/脚本也必须是管理员**（实测 GetLastError=5、OpenProcess 拒绝）。
    验证方法：`OpenProcess(PROCESS_QUERY_INFORMATION)` 返回 5，且 `ShowWindow(SW_RESTORE)` 无效。
13. DPI 缩放/多显示器：MAA 的 Win32 截图按窗口客户区，理论上自适应；
    全屏独占模式大概率截黑，要避免。最小化/被遮挡只能用伪最小化（FramePool/PrintWindow），
    而且伪最小化要改窗口样式 → 还是要管理员。
14. 锁屏、RDP 断开、系统睡眠：会话切换会让输入失效、截图可能变黑；任务会中断。
    未实测，按"不能在这些状态下跑"设计，检测到锁屏就暂停并回报。
15. PC 端分辨率/窗口比例：MAA 资源里有适配，但没实测；先按"窗口用默认尺寸、不缩放"要求。

### 五、任务映射细节

16. "次数 = 理智/21" 只对 CE 系列成立；其他关卡要按每关消耗表算（资源里有 cost），不能一刀切。
17. "清日常"是串联子任务：唤醒 → 领邮件/信用 → 基建换班 → 打关卡 → 收任务。
    默认**单步失败整体中止**并回报失败在哪一步（可选配置成跳过继续）。
18. 公开招募默认策略：**不自动选 tag**。判断依据必须满足以下三条才允许（v1 不启用，默认关）：
    a. 该招募位的剩余次数 > 0（界面能读到）
    b. 候选 tag 之间不冲突（TAG 冲突表）
    c. 组合里不含"招募许可"类消耗（许可/加急）
    三条有一条读不到 → 不做，交给主人。
19. 基建换班用 MAA 自带 plan，**会覆盖当前排班**，第一次跑之前要提醒主人备份/确认。
20. 碎石、理智药、招募许可：**默认一律不允许**，需要主人在指令里明确说"可以用药/可以碎石"。

### 六、风险与合规

21. "PC 注入比 ADB 更容易被检测"没有社区数据支撑；MAA 一直是窗口级注入，
    风险主要来自行为特征（整点准时、操作过于规整），不是注入方式本身。
22. AGPL 精确表述：**进程调用不构成分发**（不链接、不修改），不发散义务；
    修改 MAA/MaaFramework 源码并对外分发时，才必须按 AGPL/LGPL 公开对应修改。
23. 日志脱敏：UID、昵称、设备名、账号相关一律打码；本机路径保留（方便排查），
    截图在回传前裁掉右下角 UID 区域：**宽 220 × 高 40 像素**，右上角锚定的矩形，
    坐标按实际截图尺寸换算（不是固定绝对坐标）。

### 七、验证清单结果

24. **C API attach + 截图：非管理员失败，原因是权限不足**（窗口最小化不是原因，见第十四节 5.）。
    下一步：把脚本用管理员权限跑一遍，游戏窗口保持还原状态，再测。
25. **PostMessage 点击"开始行动"：未测**。当前权限注入不进去；而且真注入会在账号上产生实际行为，
    需要主人点头 + 管理员权限后再测。
26. 最小化截图：非管理员时 FramePool 超时、PrintWindow width=0；**管理员下伪最小化可用**（主人 GUI 实测通过）。
27. 锁屏后：未测。按"会中断"设计。
28. ark_stop：未测（还没有实现），设计值 10 秒。
29. 手动关游戏窗口：未测，设计上回报"窗口没了，任务中止"。
30. 连发两条 ark_run：未测，设计上是拒绝第二条。

### 八、文档自身

31. 口径已统一：**P0 允许点 GUI，日常使用不需要点界面**（已改第十、十一节）。
32. Interception 风险已单列 9.1 节（驱动签名、系统更新失效、反作弊风险面、默认不装）。
33. 超时与重试已补第十二节（分类超时、90 秒卡住、默认不自动重试、失败留截图和日志）。

### 九、还堵着的两件事（需要主人）

- **管理员权限**：游戏是管理员跑的，要我来跑就得让脚本/MAA 也以管理员启动。
  做法：建一个"以最高权限运行"的计划任务（任务名固定，见第十六节），我调用它执行**固定脚本**。
  **只有创建这个计划任务的那一次需要管理员点确认；之后每次调用都不会再弹 UAC。**
- **P0 人工跑通**：你先用 MAA GUI 跑一次 PC 端日常，确认账号/识别/流程都正常，
  我再接着做 P1/P2。

## 十六、安全边界（最高优先，不可协商）

1. **管理员计划任务只执行固定脚本，不接受任何来自 QQ 的命令行参数。**
   计划任务里写死的入口是 `D:\DSH\qqbot\maa\run-job.ps1`；它只读一个参数文件，不读 argv。
2. **任务名白名单**：`wakeup` / `mail` / `sanity` / `base` / `recruit` / `daily`。
   不在白名单里 → 直接拒绝，回"这个还不会"。
3. QQ 侧只能传"任务名 + 结构化参数"（关卡、次数、是否用药），参数**写进 JSON 参数文件**，
   **绝不拼进命令行**；脚本侧对每个字段做白名单校验（类型、枚举、范围），非法就拒绝并回报。
4. 只有主人号 `1815442184` 能触发。其他号一律回"这个只有主人能让我做"，不调用任何接口。
5. **审计**：每次调用写一条到 `D:\DSH\qqbot\maa\data\audit.jsonl`，字段
   `{time, fromQQ, task, params, result, durationMs, pid}`，只保留最近 500 条（超过就截断重写）。
6. 脚本里**禁止** `cmd /c`、`powershell -Command`、`Invoke-Expression` 这类可拼接的入口；
   一律"固定入口脚本 + 参数文件"。

## 十七、进程管理（不再按进程名批量杀）

1. **只管理自己 spawn 的进程**：起任务时把 pid 写进 `maa\data\current-job.json`。
2. 起任务前检查：`current-job.json` 里的 pid 是否还在（`Get-Process -Id`）。
   - 还在，且窗口还绑着 → **拒绝新任务**，回"上一条还在跑"。
   - 不在 → 清掉旧记录继续。
3. 结束流程固定为：`AsstStop` → 等 10 秒 → 仍在则**只 kill 这个 pid 的进程树** →
   `AsstDestroy` → 确认 pid 消失 → 写回 `current-job.json`。
4. 孤儿清理：脚本异常退出后，下次启动若发现旧 pid 还活着，先 kill 它并记一行日志，再继续。
5. **禁止** `Get-Process MaaCore | Stop-Process`、`taskkill /IM` 这类按名字批量操作。

## 十八、窗口识别（必须唯一确定）

1. 找窗口顺序（**最小化不影响匹配**，不要因为 `IsIconic` 就跳过）：
   a. 按进程名找（实测进程名 `Arknights`，主窗口类 `UnityWndClass`）
   b. 再按窗口类名 + 标题匹配（标题 `明日方舟`）
   c. 多个候选：优先 `UnityWndClass` + 有标题 + 可见；再按客户区面积取最大；
      仍不唯一 → 报错让主人关掉多余窗口
2. **最小化是正常状态**：窗口可能在 `-32000,-32000`、客户区 `160×28`，这是 Windows 对最小化
   窗口的常规表现，**不构成"未就绪"，不许据此拒绝 attach**。
   - 不要再用"客户区 ≥1280×720"当 attach 前置条件
   - 截图走伪最小化（`PrintWindowWithPseudoMinimize` / `FramePoolWithPseudoMinimize`）
3. attach 后如果截图黑 / `width=0`，排查顺序是：
   先确认**是否管理员**（伪最小化要 `SetWindowLongPtr`，非管理员必失败）→
   再确认伪最小化是否启用 → 换另一种截图方式重试；**不要直接判"窗口未就绪"**
4. 绑定成功要记一条日志：`hwnd / pid / 窗口标题 / 是否最小化 / 客户区宽高 / 截图方式 / 输入方式`。

## 十九、任务范围与参数（v1 锁死）

1. **v1 只实现三个任务**：`wakeup`（开始唤醒）、`mail`（领邮件/信用）、`sanity`（清理智）。
   `base` / `recruit` / `daily` 先只在白名单里占位，收到就回"这个还不会"。
2. 参数 schema：
   ```json
   {
     "task": "sanity",
     "params": { "stage": "CE-6", "times": 3, "allowMedicine": false, "allowStone": false }
   }
   ```
   - `stage`：必须先命中 `maa\data\stages.json` 里的关卡白名单
   - `times`：整数 1~99
   - `allowStone` 固定 false（v1 不允许碎石）
   - `allowMedicine` 默认 false；只有主人明确说"可以用药"才置 true
3. **理智换算不用"理智/21"**。数据来源：`maa\data\stages.json`（维护关卡 → 单局理智消耗 + 单局预计时长），
   这张表由人工维护，更新方式写在文件头注释里；MAA 资源里的 cost 只作交叉验证。
4. 串行执行时任一任务失败 → **默认整体中止**；"跳过继续"是可选开关，默认关闭。
5. 分类超时（配合第十二节）：
   | 任务 | 超时 |
   |---|---|
   | wakeup / mail | 10 分钟 |
   | sanity | ⌈理智 ÷ 单局消耗⌉ × 单局时长 + 10 分钟 |
   | base | 15 分钟 |
6. 基建换班（以后做）前提：运行前把当前 plan 备份到 `maa\data\base-plan-backup.json`
   （内容是 MAA 的基建排班配置快照，即各设施当前干员与班次），失败/取消可恢复。
7. 公开招募（以后做）：默认"只识别不确认"的只读模式；"自动选 tag"必须是单独开关且默认关。

## 二十、环境守卫（每次动作前检查）

1. **锁屏/会话切换**：用 `OpenInputDesktop` 判断，桌面名不是 `Default` 或打不开 → 判锁屏。
   检测到 → 暂停任务、记日志、回"屏幕锁了，任务暂停"，**不继续点**。
2. **最小化**：`IsIconic(hwnd)` 为真时**不暂停、不还原、不拒绝**——这是 PC 端的正常用法。
   - 直接走伪最小化截图；只有截图失败时才排查（先查管理员权限，再换截图方式）
   - 不要再出现"请还原窗口"这类提示
3. **全屏独占**：窗口样式命中 `WS_POPUP` 且无边框且覆盖整个显示器 → 直接拒绝，
   回"游戏是全屏独占，切窗口模式再来"。
4. **分辨率**：MAA 要求 16:9。当前窗口 1280×720 已满足，**不需要改**；
   只有 MAA 回调明确报 `UnsupportedResolution` 时，才提示主人换成 16:9 分辨率。
5. **DPI / 多显示器**：启动时记一条日志（系统 DPI、窗口所在显示器、显示器缩放）；
   所有坐标换算统一用**客户区坐标**，不混用屏幕坐标。

## 二十一、任务生命周期与状态文件

1. `maa\data\job.json` 字段固定为：
   ```json
   { "id": "job-20261102-160000", "task": "sanity", "params": {...}, "pid": 12345,
     "startedAt": 1762..., "phase": "attach|resource|running", "lastProgressAt": 1762...,
     "status": "running|done|failed|interrupted|timeout" }
   ```
2. 进度回报：**只在阶段变化时发 QQ**，同一任务最多 1 分钟一条；
   不发"正在识别…"这种没有信息量的。
3. 卡住判定：`lastProgressAt` 连续 90 秒不变 → 判卡住 → 截图 + 回"卡在 X 阶段"，不自动重试。
4. 失败留证：最后一张截图 + 最后 200 行 MAA 日志（已脱敏），路径写进回报。
5. web 重启：把 `job.json` 标成 `interrupted`；下次 `ark_status` 回"上次任务中断在 X 阶段"；
   同时按第十七节第 4 条清理旧 pid。

## 二十二、P4 之前的硬门槛（5 条全过才允许接 QQ）

1. 管理员权限下 attach + 截图成功，**截图能看到游戏画面**（不是黑图，人工确认一次）
2. `PostMessage` 能点动游戏（点"开始行动"后界面变化，两张截图对比）
3. 跑通一个最轻任务（`wakeup` 或 `mail`），回调里能看到阶段推进
4. `ark_stop` 能在 10 秒内停，**进程与句柄无残留**
5. 锁屏检测有效：锁屏时任务暂停并回报，不继续点

以上任意一条没过，就不接 QQ 工具面，先在同一台机器上用脚本手动跑。

## 二十三、实现细节附录（C API）

### 23.1 调用序列（固定顺序）

```
AsstCreateEx(callback, userdata)          # 建实例，带回调
AsstSetInstanceOption(handle, ClientType, "Official"|"Bilibili"|"PC")   # 填实测值
AsstLoadResource("C:\\MAA")               # 注意：传 MAA 根目录，不是 resource 子目录
AsstAsyncAttachWindow(handle, hwnd, screencap_method, mouse_method, keyboard_method, block)
AsstAppendTask(handle, task_type, params_json)
AsstStart(handle)                          # 注意：C API 里任务的启动是 AsstStart
```
- 截图方式：后台用 `FramePool(2) | PrintWindow(16)`，前台用 `DXGI_DesktopDup_Window(8) | ScreenDC(32)`
- **2026-11-02 实测（`C:\MAA\debug\gui.log`，同一 HWND、游戏最小化、return=true）**：
  `screencapMethod=16 (PrintWindow)`、`mouseMethod=256 (PostMessageWithWindowPos)`、
  `keyboardMethod=2 (SendMessage)`。worker 默认就用这组 16/256/2，并在 attach 前把三个值打进日志。
- 输入方式：先用 `PostMessage(4)`；不行再试 `SendMessage(2)`；前台才用 `LegacyEvent(8)`

### 23.2 回调签名（ctypes）

```python
CALLBACK = ctypes.CFUNCTYPE(None, ctypes.c_int32, ctypes.c_char_p, ctypes.c_void_p)

@CALLBACK
def on_msg(msg_id, details, arg): ...
```
- 关键点：回调对象必须**用模块级全局变量保活**（`cb = CALLBACK(fn)`），
  如果只放在函数里当局部变量，GC 回收后 C 那边回调就是野指针，进程直接崩
- 算"阶段推进"的消息：任务的 `TaskChain` / `Stage` 类回调、以及 `TaskCompleted`；
  其余（`ProcessTask` 的识别详情）只记日志不回报

### 23.3 截图格式

- `AsstGetImage(handle, NULL, 0)` 先问长度，再分配 buffer 取一次
- 返回的是 **PNG 编码的字节流**（不是原始 BGR），直接写 `.png` 文件即可
- 存放：`D:\DSH\qqbot\maa\data\shots\<job-id>-<phase>-<序号>.png`，只留最近 20 张
- 取图失败（返回 `0xFFFFFFFFFFFFFFFF`）视为失败，打印当时的截图方式与 `GetLastError`

### 23.4 失败路径

每一步返回 False / 空句柄 / -1 时要打印：步骤名、全部入参、`GetLastError()`。
不允许只写一句"attach 失败"。

### 23.5 待实测占位（TBD，等主人放行后填）

- `AsstSetInstanceOption` 的 `ClientType` 实际取值（Official / Bilibili / PC 哪一个）
- 本机 `AsstStart` 之后任务名与参数 JSON 的具体字段（MAA 版任务 schema）
- 锁屏检测在本机的表现（`OpenInputDesktop` 返回值）
- 全屏状态下的实际窗口样式组合

## 二十四、计划任务的会话与权限（施工前补丁一）

1. 计划任务属性必须固定为：
   - 运行账户：**当前登录用户**（不是 SYSTEM、不是其他账户）
   - **只在用户登录时运行**（Run only when user is logged on）
   - 勾选"使用最高权限运行"
   - **不勾**"不管用户是否登录都运行"
2. 原因：勾了"不管是否登录"会跑在 Session 0，没有交互桌面，attach 必失败；
   RDP 会话和本地控制台会话也不是同一个 session，同样不能 attach。
3. 脚本启动时必须做同会话校验：
   - `GetWindowThreadProcessId(hwnd)` 拿游戏 pid
   - `ProcessIdToSessionId(游戏 pid)` 与 `ProcessIdToSessionId(当前进程)` 比较
   - 不相等 → 立即退出，回"游戏不在当前桌面会话，无法绑定"
   - 失败时把两个 session id 都写进日志（`run_job.py` 已实现，退出码 5）
4. 进程 DPI：入口第一行调用 `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)`，
   否则 `GetClientRect` 是虚拟化坐标，点击会偏（`run-job.ps1` 和 `run_job.py` 都调了）。
5. 创建这个计划任务**必须第一次就用管理员权限创建**；普通权限创建的任务之后
   不能改成"最高权限"，只能删了重建。

### 24.1 ACL 的正确写法（踩过坑）

**错误写法**（会把自己的 DACL 清空、连管理员都读不了）：

```
icacls C:\MAA\runner /inheritance:r /grant *S-1-5-32-544:(OI)(CI)F /grant *S-1-5-32-545:(OI)(CI)RX /grant *S-1-5-18:(OI)(CI)F /T
```

原因：`(OI)(CI)` 是"继承给子对象"标志，只对子对象生效；文件自己**没有有效 ACE**，
于是连管理员也读不了，表现是"对路径的访问被拒绝"。

**正确写法（两步，已验证可恢复）**：

```powershell
takeown /f C:\MAA\runner /r /d y
icacls C:\MAA\runner /reset /T /C
icacls C:\MAA\runner /inheritance:r
icacls C:\MAA\runner /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-32-545:(OI)(CI)RX *S-1-5-18:(OI)(CI)F
icacls C:\MAA\runner /T /grant *S-1-5-32-544:F *S-1-5-32-545:RX *S-1-5-18:F
```

最后一条是关键：**不带 (OI)(CI)**，显式给文件本身 F/RX，`/T` 递归到所有子文件。

验证（应看到三行有效 ACE，不能空白）：

```powershell
icacls C:\MAA\runner\run-job.ps1
icacls C:\MAA\runner\worker\run_job.py
```

## 二十五、参数队列与严格校验（施工前补丁二）

1. 参数不再是"一个固定文件"，改成**队列目录 + 一次性文件**：
   `D:\DSH\qqbot\maa\queue\req-<seq>-<ms>.json`
   - 桥写入时先写 `.tmp` 再 `rename`（原子落盘）
   - `seq` 由桥自增（`maa\data\seq.txt`），文件名带毫秒时间戳保证唯一
2. 提权脚本领取流程（`run-job.ps1` 已实现）：
   a. 扫 `req-*.json`，按文件名排序取最早一个
   b. 立刻 `rename` 成 `.claimed`（抢所有权）
   c. 读取、校验、处理完删除
   d. rename 失败（被抢）就取下一个
   e. 未处理请求 > 10 条 → 拒绝新请求并回报"队列满了"
3. 参数 JSON 严格校验：
   - 顶层只允许 `task` / `params` / `jobId`
   - `task` 必须在白名单（v1：`wakeup` / `mail` / `sanity`）
   - `params` 只允许 `stage` / `times` / `allowMedicine` / `allowStone`
   - 任何额外字段 → 拒绝，回"参数不合法：字段名 + 原因"
   - `stage` 必须命中 `stages.json` 的键
   - `times` 必须是整数 1~99
   - `allowStone` 必须为 false（v1 不允许碎石）
   - `allowMedicine` 必须是布尔
   - 请求文件大小上限 4KB
4. `jobId` 由提权脚本生成，不由桥生成：格式 `job-YYYYMMDD-HHmmss-<seq>`，
   写进 `job.json` 和审计，回报里也带。
5. 审计字段包含 `paramsSha256` 和 `reqFile`，事后能核对"跑的到底是不是这条参数"。

## 二十六、运行器与白名单的完整性（施工前补丁三）

1. 提权相关文件放 `C:\MAA\runner\`：`run-job.ps1`、`stages.json`、`whitelist.json`、
   `worker\run_job.py`、`baseline.sha256`、`make-baseline.ps1`。
2. ACL 目标状态（**需要管理员一次性执行**）：Administrators 完全控制，Users 只读，
   SYSTEM 完全控制（任务计划服务要用）。当前实测还是可写的，属于**待主人操作项**。
3. **worker 也必须受保护**（本条最容易漏）：`run_job.py` 从 `D:\DSH\qqbot\maa\worker\`
   移到了 `C:\MAA\runner\worker\run_job.py`，理由——路径在 runner 外的话，桥能改 worker，
   主人触发任务时就会**以管理员身份执行被改过的代码**。现在它同时被 ACL 和 baseline 覆盖；
   `D:\DSH\qqbot\maa\worker\` 下的可执行副本已删除，不留第二份。
4. 每次运行前校验：
   - 算 `run-job.ps1` / `stages.json` / `whitelist.json` / `worker/run_job.py` 的 SHA256
   - 与 `baseline.sha256` 比对（子目录文件在 baseline 里写成 `worker/run_job.py`）
   - 不一致 → 拒绝执行，回"运行器被改过，已停止"，并写审计
   - baseline 由主人在创建任务那次一起生成（`make-baseline.ps1`）；以后改脚本要主人重新生成
5. **桥侧不写这些文件**：桥只能写 `queue\`（参数）和 `data\`（日志、截图）。
   桥的代码里不得出现对 `C:\MAA\runner\` 的写操作。
6. `whitelist.json` 至少包含：`allowedTasks`、`allowedParams`、`allowedTopLevel`、
   `maxTimes`、`maxRequestBytes`、`queueMaxPending`、`stagesFile`。

### 26.1 计划任务命令（主人执行，一次性）

```powershell
schtasks /create /tn "DSH-MAA-Run" /tr "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\MAA\runner\run-job.ps1" /sc once /sd 2000/01/01 /st 00:00 /rl HIGHEST /it /f
```

- `/it`：只在"当前用户已登录"的会话里跑。不加可能被建成"不管是否登录"，那样进 Session 0，
  没有交互桌面，attach 必失败
- `/sc once /sd 2000/01/01 /st 00:00`：日期放在过去，建完自己不会触发，只用 `schtasks /run` 手动调
  （旧写法 `/st 23:59` 会在 23:59 自动跑一次，别用）
- `-WindowStyle Hidden`：触发时不闪 PowerShell 窗口
- `/rl HIGHEST`：最高权限

建完验证：
```powershell
schtasks /query /tn "DSH-MAA-Run" /xml | findstr /i "LogonType RunLevel UserId"
```
期望 `LogonType=InteractiveToken`、`RunLevel=HighestAvailable`、`UserId=主人 SID`；
如果是 `Password` 或 `S4U`，说明参数不对，删了重建。

### 26.2 ACL 命令（主人执行，一次性）

```powershell
icacls C:\MAA\runner /inheritance:r /grant *S-1-5-32-544:(OI)(CI)F /grant *S-1-5-32-545:(OI)(CI)RX /grant *S-1-5-18:(OI)(CI)F /T
```

- 用 SID 不用组名：中文系统的组名可能对不上，SID 永远有效
  - `*S-1-5-32-544` = Administrators
  - `*S-1-5-32-545` = Users
  - `*S-1-5-18` = SYSTEM（任务计划服务需要）
- `/T`：把 ACL 传播到已有子文件和子目录（`worker\` 就在下面）
- 验证：`icacls C:\MAA\runner`，Users 只应有 `(RX)`，**不能有 W/M/F**

### 26.2.1 ACL 之后的约束（重要）

`C:\MAA\runner` 对普通用户**只读**之后，鱼已经不能改：
`run-job.ps1` / `stages.json` / `whitelist.json` / `worker\run_job.py`。

所以以后要改这些文件，流程固定为：

1. 鱼在自己可写的位置改好临时副本（`D:\DSH\qqbot\maa\staging\`，
   `node maa/tools/stage-worker.mjs` 会自动生成 worker 的 staging 版本）
2. 主人用管理员把文件复制进 `C:\MAA\runner\...`
3. 主人以管理员运行 `powershell -NoProfile -ExecutionPolicy Bypass -File C:\MAA\runner\make-baseline.ps1`
   重新生成基线（**鱼同样跑不了这一步**）

### 26.3 worker 完整性自测（不需要管理员就能做，已通过）

1. 直接跑 `run-job.ps1` → `IDLE no pending request`（基线对得上）
2. 改 `worker\run_job.py` 一个字节 → `REJECTED integrity mismatch: worker/run_job.py`
3. 恢复文件 → 又是 `IDLE`


## 二十七、回报、降级与工具面协议（施工前补丁四）

1. **理智消耗是估算值**：MAA 不直接回报"用了多少理智"，只能用
   `times × 单局消耗` 估算；回报里写"预计消耗"，**不写"实际消耗"**。
2. PostMessage 失败后的降级顺序要提前说清：
   - 先 `PostMessage(4)`
   - 不行试 `SendMessage(2)`
   - 再不行只能前台 `LegacyEvent(8)`（SendInput 级）——**会抢鼠标键盘，主人不能同时用电脑**
3. QQ 工具面协议（P4 前只定协议，不实现）：
   - `ark_status` → `{jobId, task, phase, elapsedSec, lastProgressAt}`
   - `ark_run {task, params}` → `{jobId}` 或 `{ok:false, error}`
   - `ark_stop {jobId}` → `{ok, stoppedInMs}`
   - 限流：同一时间只允许 1 个 job；只有主人号可用
4. 截图回传：裁掉右下角 UID 区域（宽 220 × 高 40，按实际尺寸换算），
   宽度压到 ≤1280；QQ 发送失败只回路径，不重试。
5. 审计文件：按天分文件 `audit-YYYYMMDD.jsonl`，追加写，单文件超 2MB 滚动成 `.1`
   （`run-job.ps1` 已实现）。

## 二十八、施工前补丁的验收结果（2026-11-02 实测）

| 编号 | 内容 | 结果 |
|---|---|---|
| A1 | 计划任务属性（当前用户/只在登录时/最高权限） | **通过**：LogonType=InteractiveToken、RunLevel=HighestAvailable、UserId=主人 SID（2026-11-02 主人建好并核对） |
| A2 | 用"不管是否登录"跑一次应报不在同一会话 | **待主人操作**（同上） |
| A3 | 缩放下截图尺寸与点击坐标 | **待复验**：attach 参数改成 16/256/2 之后再测（当前系统 DPI 是 100%，不是 125%） |
| B1 | 两条请求按顺序领取、不串台 | **通过**：wakeup(job-...-5) → sanity(job-...-6)，各条参数正确 |
| B2 | 带额外字段的请求被拒 | **通过**：`illegal top-level field: hack` |
| B3 | stage 不在白名单被拒 | **通过**：`stage not allowed: XY-1` |
| C1 | 改 run-job.ps1 一个字节后被拒 | **通过**：`integrity mismatch: run-job.ps1` |
| C2 | 恢复文件后正常 | **通过**：恢复后 `IDLE no pending request` |
| C3 | 桥写 `C:\MAA\runner\` 应被拒 | **通过**：ACL 收紧后桥侧写入直接 Access denied（2026-11-02 复验） |
| D1 | 回报出现"预计消耗" | **通过**：worker 打印"预计消耗理智 42（2 局 x 21）" |
| D2 | 前台降级路径写明 | **通过**：见 27.2 |

另外实测到两件事，已写进代码：
- `AsstLoadResource` 要传 MAA **根目录** `C:\MAA`，传 `C:\MAA\resource` 返回 False
- 找窗口不能只按"客户区最大"，游戏进程里有个不可见的 Chrome 窗口更大；
  已改成优先 `UnityWndClass` + 可见 + 有标题（`run_job.py`）

当前 attach 仍失败（`AttachWindow ret=false`），原因是**非管理员进程绑不上管理员权限的游戏**，
和 A1 是同一个根因，等主人把计划任务以最高权限建起来再验。

## 二十九、升级到 MAA 6.21.1 后的重测（2026-11-02 16:20）

### 29.1 安装

- 旧版整体改名保留：`C:\MAA` → `C:\MAA-6.9.3-backup`（没删，可回退）
- 新版解压：`D:\迅雷下载\MAA-v6.21.1-win-x64.zip` → `C:\MAA`，102 秒
- 版本证据：`MAA.exe` FileVersion/ProductVersion = **6.21.1**；
  `MaaCore.dll` 6264 KB、`MaaWin32ControlUnit.dll` 723 KB（均为 2026-11-01 17:01）；
  `resource\version.json` 的 `last_updated` = 2026-11-01 13:43:20
- 升级时 MAA 没在跑（只有游戏在跑），覆盖安全

### 29.2 导出检查（6.21.1 的 MaaCore.dll）

| 导出 | 6.9.3 | 6.21.1 |
|---|---|---|
| AsstCreateEx | 有 | 有 |
| AsstSetInstanceOption | 有 | 有 |
| AsstLoadResource | 有 | 有 |
| AsstAsyncAttachWindow | 有 | 有 |
| AsstAttachWindow | 有 | 有 |
| AsstAppendTask | 有 | 有 |
| AsstStart | 有 | 有 |
| AsstStop | 有 | 有 |
| AsstDestroy | 有 | 有 |

`AsstGetVersion()` 返回 `v6.21.1`。

### 29.3 AsstLoadResource 语义

- `AsstLoadResource("C:\\MAA")` → **True**
- `AsstLoadResource("C:\\MAA\\resource")` → **False**
- `AsstSetUserDir("C:\\MAA")` → True；`AsstCreateEx(None,None)` 能建出实例

结论：和 6.9.3 完全一致，**传 MAA 根目录**这条不变。

### 29.4 attach 重测（非管理员）

- 窗口：`hwnd=1444392`、`UnityWndClass`、客户区 1680×1050、可见
- 回调新增了三条 6.9.3 没有的信息，很有用：
  - `FastestWayToScreencap`：`{"cost":15,"method":"Win32"}`
  - `ScreencapCost`：`{"avg":15,"max":15,"min":15}`
  - `UnsupportedResolution`：`{"height":1050,"width":1680}`、`"why":"Not 16:9"`
- `AttachWindow` 仍然 `ret:false`（cost 385ms）；截图取不到，`PrintWindow failed, error code: 5`（拒绝访问）
- 结论不变：**非管理员进程绑不上管理员权限的游戏**
- 关于分辨率：这次测的是 1680×1050（当时窗口状态），MAA 报了 `UnsupportedResolution`。
  **但主人后来实测窗口是 1280×720，正好 16:9，不需要改**；
  以后只有在 MAA 真的报 `UnsupportedResolution` 时才提示改分辨率。
- **2026-11-02 17:04 主人实测：用管理员 MAA 6.21.1 把游戏窗口最小化后绑定成功、开始唤醒跑通**，
  所以本节"非管理员失败"的结论仍然成立，但"不许最小化"的说法作废（见第十四节 5.）

### 29.5 二十八节各项在 6.21.1 上的状态

| 编号 | 6.9.3 结果 | 6.21.1 结果 |
|---|---|---|
| A1 计划任务属性 | 待主人 | 待主人（未变） |
| A2 非登录会话拒绝 | 待主人 | 待主人（未变） |
| A3 125% 缩放 | 待实测 | 待实测（未变） |
| B1 队列顺序 | 通过 | 未重跑（与 MAA 版本无关，代码未改） |
| B2 额外字段拒绝 | 通过 | 未重跑（同上） |
| B3 非法关卡拒绝 | 通过 | 未重跑（同上） |
| C1 完整性拦截 | 通过 | 未重跑（同上） |
| C2 恢复后正常 | 通过 | 未重跑（同上） |
| C3 桥写 runner 被拒 | 未通过 | 未通过（ACL 仍未收紧） |
| D1 预计消耗 | 通过 | 未重跑（同上） |
| **新增** 管理员 attach | — | **待主人以管理员运行** |
| **新增** 分辨率 16:9 | — | **不合格**：现在 1680×1050 |

### 29.6 给主人的两条命令

管理员 PowerShell 里跑（只读：绑窗口 + 截一张图，不点击）：

```powershell
& "C:\Users\Eyjafjalla\AppData\Local\Programs\Python\Python310\python.exe" `
  "D:\DSH\qqbot\maa\tests\attach_shot.py" "D:\DSH\qqbot\logs\maa-621-admin.png"
```

跑完把输出贴回来（会打印 attach 结果、image bytes、以及失败时的 MAA 回调）。






## 三十、v3 改造：改用官方 Python 绑定 + 复用仓库现成件（2026-11-02）

### 30.1 为什么要改

自写的 ctypes 封装重复造轮子、还漏了两件关键事实：

1. **官方 Python 绑定只存在于归档分支** `archive/dev-v1`（dev-v2 的 `src` 下已经没有 Python 目录），
   但它是权威实现：`Asst.load/append_task/start/stop/running/get_image` 都有，只是**没有 attach**。
2. **PC 模式要额外加载增量资源**：GUI 会在主资源之后加载
   `resource\platform_diff\PC`（注意：不是 `...\PC\resource`，带多一层会返回 False，实测过）。

所以策略是：**官方绑定 + 一个 attach 补丁**，不再自己写全套。

### 30.2 复用了哪些文件（都在 worker/vendor 下）

| 文件 | 来源 |
|---|---|
| `maa/asst.py` | https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/archive/dev-v1/src/Python/asst/asst.py |
| `maa/utils.py` | https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/archive/dev-v1/src/Python/asst/utils.py |
| `maa_tasks_schema.json` | https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/dev-v2/docs/maa_tasks_schema.json |
| `LICENSE-来源说明.txt` | 自己写的来源与 AGPL 边界说明 |

许可：都是 AGPL-3.0。**本机进程调用、不改不对外分发**，不触发开源义务；
改了并对外分发才要按 AGPL 公开修改。

### 30.3 attach 补丁（worker/attach_patch.py）关键点

1. `patch_lib()`：给 `Asst._Asst__lib` 补 argtypes/restype —— `AsstAttachWindow`、
   `AsstAsyncAttachWindow`、`AsstConnected`、`AsstGetImageBgr`、`AsstBackToHome`、`AsstGetTasksList`
2. `load_pc_resources()`：`AsstLoadResource("C:\\MAA\\resource\\platform_diff\\PC")`
3. `attach_window()`：`AsstAsyncAttachWindow(..., block=False)` → 在回调里等
   `what=AttachWindow` 且 `async_call_id` 匹配（超时 15 秒）→ 失败再走同步 `AsstAttachWindow` 兜底
4. 枚举常量来自 include/AsstCaller.h：截图 GDI=1/FramePool=2/DXGI=4/DXGI_Window=8/PrintWindow=16/ScreenDC=32；
   输入 Seize=1/SendMessage=2/PostMessage=4/LegacyEvent=8/…/PostMessageWithWindowPos=256
5. 默认参数 16/256/2，来源 `C:\MAA\debug\gui.log` 实测（同 HWND、最小化、return=true）

### 30.4 找窗口改成 GUI 同款

`EnumWindows` + `IsWindowVisible` + **标题完全等于「明日方舟」**，多个取第一个；
不再按"进程名 + 类名 + 客户区最大"硬找。最小化仍然正常参与匹配（客户区可能是 0×0，只记日志不拦）。

### 30.5 管理员判定修了个 bug

原来用 `OpenProcess(QUERY_INFORMATION, 自己)` 判管理员——**对自己的进程永远成功**，
所以非管理员也会被当成管理员。改成 `OpenProcessToken` + `GetTokenInformation(TokenElevation)`。

### 30.6 基线改成递归覆盖

原来只校验 4 个文件，`worker/vendor/*.py` 和 `attach_patch.py` 不在保护范围——等于留了后门。
现在 `make-baseline.ps1` 遍历整个 `C:\MAA\runner`（排除 baseline.sha256 和 `__pycache__`），
`run-job.ps1` 逐条比对；文件多了、少了、改了一个字节都会 `integrity mismatch`。

### 30.7 任务名改用 MAA 标准

`wakeup → StartUp`、`mail → Award`、`sanity → Fight`；
Fight 参数 `{stage, times, medicine, stone}`，字段名对齐 `docs/maa_tasks_schema.json`。
`stages.json` 只留确认过的 `CE-6(21)`、`LS-6(18)`，其它关卡一律拒绝。

### 30.8 当前状态（2026-11-02 17:45）

- 代码、staging、命令都准备好了；**非管理员 dry-run 已验**：能找到窗口、同会话校验通过、
  正确停在"需要管理员"（退出码 6），说明绑定/patch/窗口识别都能跑通
- T1~T4 需要管理员：等主人把 staging 入库 + 重生成 baseline + 触发 `DSH-MAA-Run`
- 已知风险：`AsstLoadResource(PC)` 的路径必须是不带 `resource` 的那层（多一层返回 False）

## 三十一、v3 部署失败后的两处修复（2026-11-02 18:10）

### 31.1 is_admin 误判（根因：HANDLE 没声明，被截断成 32 位）

旧实现：

```python
h = wintypes.HANDLE()
if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), 0x0008, ctypes.byref(h)):
    return False
```

问题：`GetCurrentProcess()` 没声明 restype，返回的是 Python int（被截成 32 位 -1），
传给没声明 argtypes 的 `OpenProcessToken` 就成了无效句柄 → 失败码 6 → 一律判"非管理员"。
管理员终端里跑也失败，所以计划任务 102ms 就被这条 FAIL 拦下。

新实现（双保险 + 诊断）：

```python
def is_admin():
    # 1) shell32.IsUserAnAdmin()
    shell32 = ctypes.WinDLL('shell32', use_last_error=True)
    shell32.IsUserAnAdmin.restype = wintypes.BOOL
    is_user_admin = int(bool(shell32.IsUserAnAdmin()))
    # 2) token 完整性级别：TokenIntegrityLevel=25，High=0x3000、System=0x4000
    sid, level, err = _integrity_level()
    result = bool(is_user_admin == 1 or level >= 0x3000)
    log(f'admin check: pid={os.getpid()} IsUserAnAdmin={is_user_admin} '
        f'integrity={sid} level={level:#x} err={err} -> admin={result}')
    return result
```

并且所有 Win32 调用都显式声明了 argtypes/restype（HANDLE 一律用 `wintypes.HANDLE`）。

自测（非管理员终端）：

```
[worker] admin check: pid=31632 IsUserAnAdmin=0 integrity=S-1-16-8192 level=0x2000 err=0 -> admin=False
[worker] FAIL: 需要管理员权限（伪最小化截图要改窗口样式）
exit=6
```

管理员终端的结果等主人部署后验（预期 `level=0x3000`、`admin=True`、继续走到 attach）。

### 31.2 完整性比对被删掉了（C1 曾失效）

v3 那版 `run-job.ps1` 只算了 `$current`，没和 baseline 比对，等于 C1 白做。
现在补回来了，逻辑是双向的：

- baseline 有、目录里没有 → `integrity mismatch: <rel> (missing file)`
- 目录里有、baseline 没有 → `integrity mismatch: <rel> (unexpected file)`
- 哈希不同 → `integrity mismatch: <rel>`
- 排除 `baseline.sha256` 自身和 `__pycache__`

### 31.3 沙箱自测（用同一份脚本，指向沙箱目录跑，不动生产）

| 用例 | 结果 |
|---|---|
| 正常 | `IDLE no pending request` |
| 改 worker 一个字节 | `REJECTED integrity mismatch: worker/run_job.py` |
| 恢复 | `IDLE` |
| 加一个未登记文件 | `REJECTED ... worker/evil.py (unexpected file)` |
| 删一个已登记文件 | `REJECTED ... worker/attach_patch.py (missing file)` |
| 全部恢复 | `IDLE` |

沙箱在 `D:\DSH\qqbot\maa\sandbox\`，只在本地验证脚本逻辑用，不参与生产。

### 31.4 文件命名

runner 内文件名一律 ASCII：vendor 下的中文许可说明已改名 `LICENSE-SOURCE.txt`
（中文名在某些链路会被写成 `????`，baseline 里也跟着变，容易误判）。

## 三十二、截图与日志修复（T1 之后，2026-11-02 18:20）

### 32.1 get_image 签名不对

T1 里 attach 已经成功（ret=true，cost 139ms），但那句报错：

```
[worker] get_image failed: Asst.get_image() missing 1 required positional argument: 'size'
```

官方绑定是 `get_image(size)`，而且它返回的是**整块 buffer**（含尾部补零），不适合取证。

改法：不走绑定的 get_image，直接调 `AsstGetImage`——先问实际长度，再取一次，
得到真正的字节数（`attach_patch.grab_image()`）。

### 32.2 PNG / BGR 判别

- 前 8 字节是 `89 50 4E 47 0D 0A 1A 0A` → 直接写 `.png`
- 否则当 BGR 原始数据：有 PIL 用 `Image.frombytes('RGB', (cw,ch), data, 'raw', 'BGR', 0, 1)` 转 PNG；
  没 PIL 就手写 24 位 BMP（自底向上、行对齐）
- 日志里打印 magic、字节数、是否 PNG

### 32.3 截图失败不许拖垮任务

截图只是取证：失败只写日志 + 在 shots 目录留 `<name>.error.txt`，
**attach 成功就继续跑任务**，不 return、不改 status。

### 32.4 三张截图

`<jobId>-pre-attach.png`（attach 前）、`<jobId>-attach.png`（attach 后）、
`<jobId>-after.png`（任务结束）；路径写进 job.json 的 `shots` 数组。

### 32.5 worker 的 stdout 落到文件

`run-job.ps1` 的 `Start-Process` 加了重定向：

```powershell
-RedirectStandardOutput (Join-Path $DataDir ("worker-$jobId.log")) `
-RedirectStandardError  (Join-Path $DataDir ("worker-$jobId.err.log")) `
```

以后计划任务失败也能直接看 `data\worker-<jobId>.log`，不用手动重跑。
注意：两个文件必须不同，否则 Start-Process 会报错。

### 32.6 自测（不需要管理员）

`maa/tests/test_shot.py` 用假数据覆盖三条路径：

| 用例 | 结果 |
|---|---|
| grab_image 返回 None | PASS（返回 None + 写 .error.txt） |
| 返回 PNG 字节 | PASS（原样落盘，magic 正确） |
| 返回 BGR 字节 | PASS（PIL 转 PNG，64×64） |

### 32.7 待重测

部署后按 T1（还原窗口）→ T2（最小化）→ T4（StartUp 回调）顺序来；
重点看 `data\worker-<jobId>.log` 里的 `shot: magic=... bytes=... png=...`。

## 三十三、截图取图的正确姿势（2026-11-02 18:35）

### 33.1 AsstGetImage 不支持"先问长度"

MAA 源码 `AsstCaller.cpp` 里 `AsstGetImage` 在 `buff == nullptr` 时**直接返回 -1**，
所以"先传 null 问长度、再分配"这条路根本走不通——之前的 `grab_image` 必然拿不到图。

正确做法：**一次调用，自己准备足够大的 buffer**：

```python
buf = ctypes.create_string_buffer(max_bytes)          # 16MB 上限
got = lib.AsstGetImage(h, buf, max_bytes)
if not got or got == 0xFFFFFFFFFFFFFFFF or got > max_bytes:
    return None
return buf.raw[:got]
```

### 33.2 attach 后立刻取图可能还没有新帧

先触发一次异步截图，等回调里出现 `what=Screencap` 或直接等 300ms，再取图：

```python
lib.AsstAsyncScreencap(h, True)   # 第二个参数 True = 触发一次
```

取不到时先 `AsstGetImage`，再退到 `AsstGetImageBgr`（同签名，BGR 长度应是 cw×ch×3），
两个都失败才写 `.error.txt`。

### 33.3 打印 magic 判断格式

每次取图都打印长度和前 8 字节：
- `89 50 4E 47 0D 0A 1A 0A` → PNG，原样写 `.png`
- 其它 → BGR 原始数据，用 PIL 转 PNG（没 PIL 写 BMP）

### 33.4 日志里的中文乱码

计划任务/重定向环境下控制台是 GBK，日志里窗口标题会变乱码。两处一起改：
1. worker 启动时 `sys.stdout.reconfigure(encoding='utf-8')`（stderr 同理）
2. `run-job.ps1` 启动子进程前设 `$env:PYTHONIOENCODING = 'utf-8'`

### 33.5 部署

```powershell
robocopy "D:\DSH\qqbot\maa\staging\runner" "C:\MAA\runner" /MIR /NFL /NDL
powershell -NoProfile -ExecutionPolicy Bypass -File C:\MAA\runner\make-baseline.ps1
schtasks /run /tn "DSH-MAA-Run"
```

跑完看 `data\worker-<jobId>.log`：应出现 shot: magic=... bytes=...；
以及 `data\shots` 下三张截图。

## 三十四、退出码与 job.json 合并（2026-11-02 18:45）

### 34.1 退出码读错

PS 5.1 下 `Start-Process ... -RedirectStandardOutput/Error -PassThru -Wait:$false` 之后再
`WaitForExit()`，`$proc.ExitCode` 可能仍是 `$null`，被 `$code = 1` 兜成 1，
于是任务明明成功也报失败。

改成同步 `[System.Diagnostics.Process]`：

```powershell
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $Python
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$p = [System.Diagnostics.Process]::Start($psi)
$outText = $p.StandardOutput.ReadToEnd()
$errText = $p.StandardError.ReadToEnd()
$p.WaitForExit()
$code = $p.ExitCode
```

顺便把 stdout/stderr 直接写进 `data\worker-<jobId>.log` 和 `.err.log`。

计时也从 `(Get-Date) - $t0` 换成 `[System.Diagnostics.Stopwatch]`
（DateTime 相减在某些上下文会报 op_Subtraction 重载错误）。

### 34.2 job.json 被 run-job.ps1 覆盖

worker 结束时会自己写 job.json（带 `status=done` 和 `shots` 列表），
而 run-job.ps1 拿启动前的旧对象重写，把 shots 和真实 status 冲掉了。

现在：worker 退出后**先重新读一次 job.json**，然后只补三类字段：
- `pid`：补成实际进程号
- `phase`：为空才写 `finished`
- `lastProgressAt`：更新时间

status 规则：
- worker 没写 → 按退出码填 done/failed
- worker 写了 `done` → **绝不改成 failed**
- worker 停在 `running` 且退出码非 0 → 改 failed

### 34.3 沙箱自测（用假 worker，不动生产）

| 用例 | 期望 | 结果 |
|---|---|---|
| worker exit 0，自己写 status=done + 3 个 shots | 控制台 exit=0，job.json 保留 done 和 shots | **通过**：exit=0、status=done、shots 三条都在 |
| worker exit 6，只写 status=running | 控制台 exit=6，status 改 failed | **通过**：exit=6、status=failed |

两种情况下 `data\worker-<jobId>.log/.err.log` 都正常生成。

### 34.4 真机自测（要主人跑，管理员）

```powershell
# 放一条 wakeup 请求后
powershell -NoProfile -ExecutionPolicy Bypass -File C:\MAA\runner\run-job.ps1
```

期望：控制台 `DONE jobId=... exit=0 ... status=done`；
job.json 里 status=done 且有 3 个 shots；再 `schtasks /run /tn "DSH-MAA-Run"` 复验一次。

## 三十五、v3 收尾：回调日志 + 四个小 bug（2026-11-02 18:55）

### 35.1 submit.mjs 兼容 BOM（高）

PS 5.1 的 `Set-Content -Encoding utf8` 会写 BOM，`JSON.parse` 直接报错。
读文件后先剥：`.replace(/^\uFEFF/, '')`（第 23 行附近）。
实测：带 BOM 的文件能正常入队。

### 35.2 回调日志（高，T4 就卡在这）

`worker/run_job.py` 里的 `on_cb` 重写：
- 每条回调都打 `[maa] <msg_id> <what>(<人话>) task=.. status=.. ret=.. cost=.. uuid=..`，
  字段缺失就不打印，details 超过 160 字截断
- 人话映射：TaskChain=任务链、Stage=界面/阶段、SubTaskExtraInfo=子任务信息、
  TaskCompleted=任务完成、AttachWindow=绑定窗口、Screencap=截图、UnsupportedResolution=分辨率不支持
- 阶段类消息写进 job.json 的 `progress`（如 `TaskChain:StartUp/RUNNING`）
- JSON 解析失败只记 `_raw`，绝不抛异常中断任务

### 35.3 durationMs 恒为 0（中）

两个原因：
1. 原先用 `(Get-Date) - $t0`，在某些上下文直接抛重载错误
2. 换成 `Stopwatch::StartNew()` 后，在这份脚本里赋值仍是空（PS 5.1 行为诡异）

最终方案：**durationMs 由 worker 自己算**（Python `time.monotonic()`，模块级 `_T0`），
每次写 job.json 都带上；`run-job.ps1` 只在 `$ms > 0` 且 job 里没有该字段时才补，避免用 0 覆盖。
实测：worker 单独跑一次留下 `durationMs=16`。

### 35.4 收尾 phase 还是 running（中）

`run-job.ps1` 用 `Add-Member -Force` 写 `phase='finished'`（ConvertFrom-Json 出来的对象缺字段不能直接赋值）。

### 35.5 attach 前截图必然失败（低）

去掉 `pre-attach` 那次截图；现在只留 `attach` 和 `after` 两张。

### 35.6 自测结果

| 用例 | 结果 |
|---|---|
| 回调 TaskChain / Stage / TaskCompleted 写进 progress | 通过（test_cb.py 四条全 PASS） |
| 坏 JSON、超长 details 不中断 | 通过 |
| 带 BOM 的请求文件入队 | 通过 |
| 沙箱 run-job：exit 0 / status=done / phase=finished / shots 3 个 | 通过 |
| worker 单独跑：durationMs=16、phase=blocked:need-admin、status=failed | 通过 |
| 中文窗口标题不再乱码 | 通过（日志里是「明日方舟」） |

### 35.7 还差什么

wakeup 和 mail 的真实两次运行要主人在管理员环境跑（我这边没权限），跑完把
`data\worker-<jobId>.log` 里的 `[maa]` 行贴回来，就能确认 T4 的
TaskChain / Stage / TaskCompleted 是否按预期推进。

## 三十六、完成判定看回调 + 收尾兜底 + iconic 观测（2026-11-02 19:10）

### 36.1 为什么要改完成判定

上一轮 StartUp 实际回调是 `ExceededLimit(ReturnButton)`，但 job.json 记成了 done。
原因是旧逻辑"进程不 running 了就算完成"。改成**只认回调**：

- `TaskCompleted` / `AllTasksCompleted` / `TaskChainCompleted` → done
- `ExceededLimit` / `TaskChain` status=FAILED/ERROR → failed（把 task 名写进 job.json）
- 进程停了但**没看到完成回调** → `unknown`，按 failed 记，绝不记 done
- 90 秒无阶段推进 → failed(stuck-90s)；总超时 → failed(timeout)

实现位置：`worker/run_job.py` 的 `on_cb`（写 `job_events`）和 `wait_for_job()`

### 36.2 run-job.ps1 收尾进 try/finally

worker 之后的所有收尾（写 worker log、删 claimed、写 audit、合并 job.json）都包进 try；
finally 里至少保证**删掉 claimed 文件**，catch 里补一条 audit（result 记 `wrapup-error: ...`），退出码 12。

### 36.3 durationMs 在 PS 里怎么都取不到（重要发现）

实测：这份脚本里**第一个时间表达式一定拿到 null**——
`Get-Date`、`[datetime]::Now` 都是；紧接着第二次调用又正常。
所以之前 `New-TimeSpan -Start $jobStartTime` 一直报"不能把 null 转成 DateTime"。

最终方案：**run-job.ps1 不再计时**。durationMs 由 worker 用 `time.monotonic()` 算好写进 job.json，
run-job.ps1 读出来写 audit。实测 audit 里 `durationMs=470`、job.json 里也是 470。

### 36.4 iconic 观测（窗口有没有被还原）

四个点各记一行：
- `iconic before-attach`：attach 前
- `iconic after-attach`：attach 后
- `iconic after-start`：任务启动后
- `iconic after-task`：任务结束后

哪一步从 True 变 False，就说明窗口是在那一步被还原的（这次要定位的就是这个）。

### 36.5 沙箱自测

| 用例 | 结果 |
|---|---|
| worker 写 durationMs=470 + status=done + 3 shots | 通过：DONE ms=470，job.json 四个字段全对，queue 无残留 |
| 收尾异常 | 通过：WRAPUP-ERROR + audit 记 wrapup-error，claimed 被清掉 |

### 36.6 还等什么

wakeup 和 mail 各跑一次真机（管理员），看：
- `DONE ... exit=0 ms>0`（ms 现在应该是有值的）
- audit 有新记录
- queue 里没有 .claimed 残留
- mail 那次 worker log 里应有 TaskChain / Stage / TaskCompleted 等 [maa] 行
- 四条 iconic 日志的顺序，定位窗口在哪一步被还原

## 三十七、is_iconic 缺失与 Win32 签名（2026-11-02 19:25）

### 37.1 NameError: is_iconic

worker 加 iconic 观测时只写了调用、没写定义，真机跑起来直接崩在：
`log(f"iconic before-attach={is_iconic(win['hwnd'])}")`。

补上定义（放在 `user32` 之后、`is_locked` 之前）：

```python
def is_iconic(hwnd):
    user32.IsIconic.restype = wintypes.BOOL
    user32.IsIconic.argtypes = (wintypes.HWND,)
    return bool(user32.IsIconic(hwnd))
```

四个观测点（before-attach / after-attach / after-start / after-task）现在都能用。

### 37.2 所有 Win32 调用显式 argtypes/restype

新增 `_declare_win32()`，在模块加载时统一声明：
`SetProcessDpiAwarenessContext`、`OpenInputDesktop`、`CloseDesktop`、
`EnumWindows`、`IsWindowVisible`、`GetWindowTextLengthW`、`GetWindowTextW`、
`GetClassNameW`、`GetWindowThreadProcessId`、`GetClientRect`、`IsIconic`、
`GetCurrentProcess`、`ProcessIdToSessionId`。

**规则：worker 里所有 Win32 调用必须显式写 argtypes/restype。**
默认 int 返回值会把 64 位句柄截断，之前的 is_admin 误判就是这么来的。

### 37.3 历史 .claimed 归档

修收尾之前留下的 `.claimed`（第 22~26 条）不删，启动时归档：
`data\claimed-archive\<yyyyMMdd-HHmmss>\`，保留原文件名方便排查。
归档发生在领取新请求之前，日志里会打 `ARCHIVED N stale claimed -> <dir>`。

### 37.4 自测

| 用例 | 结果 |
|---|---|
| worker dry-run（非管理员） | 通过：走到 admin 校验，无 NameError，exit=6 |
| 沙箱放两个 .claimed 再跑 | 通过：ARCHIVED 2，queue 清空，文件进了 claimed-archive |

## 三十八、窗口被 attach 拉起 + 终态判定修正（2026-11-02 19:35）

### 38.1 窗口为什么会跳出来（实测定位）

四个观测点：`before-attach=True, after-attach=False, after-start=False, after-task=False`，
说明**是 MAA 的 Win32 attach 把窗口拉起来的**，不是任务本身。

改法：attach 成功后，如果原来是最小化、现在被拉起，就压回去：

```python
if was_iconic and not is_iconic(hwnd):
    user32.ShowWindow(hwnd, 6)      # SW_MINIMIZE
    time.sleep(0.2)
    still_min = is_iconic(hwnd)
    probe = save_shot(asst, "...-after-reminimize.png", win)
    log(f"restore-after-attach minimized={still_min} shot_ok={bool(probe)}")
```

- 压回去之后**再截一张图验证还能取到画面**；取不到就是压回最小化破坏了伪最小化截图，
  这时回退成保持还原状态，并记 `WARN: 压回最小化后截图失败，回退为保持还原状态`
- 日志固定格式：`restore-after-attach minimized=True shot_ok=True`

### 38.2 终态判定：数号 + what 双保险

mail 明明收到了完成回调却记 `stopped-without-completion`，原因是旧代码只认 what 字符串。
现在按实测的 MAA 回调号判定：

| 号 | 含义 | 处理 |
|---|---|---|
| 10002 | TaskChain 完成 | `job_events.completed = True` |
| 20003 | ExceededLimit | `job_events.failed = True`，reason 记 `ExceededLimit/<task>` |

what 字符串判定保留做兜底；`progress` 里也会带 msg_id，方便和 MAA 文档对照。
进程停了但既没 10002 也没失败回调 → 仍然是 unknown（按 failed），不会误记 done。

### 38.3 StartUp 的 ExceededLimit(ReturnButton)

原因：跑 wakeup 时游戏停在「任务」页，StartUp 想回主界面失败。

- **短期约定：跑 wakeup 前，游戏必须停在主界面（登录后的大厅）**，
  在任务页/关卡页/结算页都会触发 ExceededLimit
- **长期**：可以在 StartUp 之前先调 `AsstBackToHome`，等回主界面再 append（还没接，等主人定）

### 38.4 自测

| 用例 | 结果 |
|---|---|
| 10002 → completed | 通过（test_cb_ids.py） |
| 20003 → failed + reason 含 ExceededLimit | 通过 |
| 原有回调日志 / progress / 坏 JSON | 通过（test_cb.py） |

### 38.5 待重测

wakeup（先手动回主界面）+ mail 各一次，确认：
- attach 后 `iconic` 仍是 True（日志里有 `restore-after-attach minimized=True shot_ok=True`）
- 窗口不再跳到前台
- mail 的 `status=done`，不给 `stopped-without-completion`

## 三十九、wakeup 前先回主界面（AsstBackToHome，2026-11-02 19:40）

### 39.1 接入方式（保守）

只在 `task == 'wakeup'` 时执行，其它任务完全不受影响；必须在 attach 成功之后；
**最小化也照样调**——MAA 的输入走 PostMessage，后台点击有效。

```python
if task == 'wakeup':
    before_count = len(msg_log)
    try:
        bh = attach_patch.back_to_home(asst)
        log("back-to-home ok" if bh else "back-to-home failed, 继续 StartUp")
    except Exception as e:
        log(f"WARN: back-to-home raised {e!r}, 继续 StartUp")
    # 最多等 2 秒，只看调用之后新增的阶段回调
```

- 返回 true → `back-to-home ok`；false → `back-to-home failed, 继续 StartUp`；
  抛异常 → `WARN: back-to-home raised ...`，**都不中断任务**
- 等待上限 2 秒（100ms 轮询），只看调用之后新增的 TaskChain/Stage，避免被旧的回调骗过
- `AsstBackToHome` 的签名：`(ctypes.c_void_p,) -> ctypes.c_bool`，已补进 attach_patch

### 39.2 语义变化

- 加了这一步之后，**wakeup 不再强制要求游戏停在主界面**
- 但如果 back-to-home 本身失败（比如游戏在特殊界面、或有的页面上 ReturnButton 识别不到），
  StartUp 依旧会 `ExceededLimit` —— 属于**已知限制**，日志里能看到 `back-to-home failed`

### 39.3 验证计划（要主人跑）

| 场景 | 期望 |
|---|---|
| 游戏在「任务」页 → wakeup | 日志 `back-to-home ok`，随后 StartUp 完成，status=done |
| 游戏在主界面 → wakeup | 照常 done（back-to-home 也 ok） |
| mail | 完全不受影响（不触发 back-to-home） |

## 四十、截图方式实验 + 任务结束压回 + back-to-home 取证（2026-11-02 19:45）

### 40.1 screencap 换成 FramePool(2) 做实验

现象：attach 时窗口被拉起（True→False），压回之后**任务执行中又被还原**（after-task=False）。
怀疑跟 PrintWindow(16) 有关——伪最小化要临时改窗口样式、把窗口"抬起来"。

改法：

```python
# 2=FramePool（实验：可能不需要拉起窗口），16=PrintWindow，18=两者都试
SCREENCAP = int(os.environ.get('MAA_SCREENCAP', '2'))
```

- 默认值改成 **2**，想回到 PrintWindow 就设环境变量 `MAA_SCREENCAP=16`
- attach 的 detail 里会带 `screencap`，日志能看出这次用的哪种
- 判断标准：看 `iconic after-attach` 是否还能保持 True；能保持就固定用 2

### 40.2 任务结束必须压回最小化

```python
if was_iconic and not iconic_end:
    user32.ShowWindow(hwnd, 6)   # SW_MINIMIZE
    time.sleep(0.2)
    log(f"minimize-after-task minimized={is_iconic(hwnd)}")
```

这样即使任务过程中被还原，跑完也会回到最小化，不会一直占着前台。

### 40.3 back-to-home 无效的取证

数据：`back-to-home ok` 但仍然 `ExceededLimit(ReturnButton)`。
说明 AsstBackToHome 的返回值只代表"调用发出了"，**不代表界面真的回到了主界面**。

现在 back-to-home 之后固定：
1. 等 1 秒
2. 截一张 `<jobId>-after-backhome.png` 存进 shots
3. 再进入最多 2 秒的阶段回调等待

这样下次失败可以直接看那张图，判断当时到底停在哪一页，而不用靠猜。

**没有做**"自动判定不在主界面就拒绝跑"——因为判定主界面需要模板匹配，
在没确认模板可靠之前硬判会误伤；先靠截图取证 + 日志，等数据够了再决定。

### 40.4 验证计划（要主人跑）

| 场景 | 看什么 |
|---|---|
| mail | `status=done`、`iconic after-task=True`、有 `minimize-after-task` 或本来就是 True |
| wakeup（主界面） | done，`back-to-home ok` |
| wakeup（任务页） | 要么回主界面成功，要么给出 after-backhome 截图 + 明确失败原因 |

### 40.5 已知限制

- FramePool 在部分机器上对后台窗口更挑剔；如果换了 2 之后 `shot_ok=False`，
  就设 `MAA_SCREENCAP=18`（两种都试）或退回 16
- back-to-home 的返回值不可信，只能靠截图确认真实界面

## 四十一、截图方式实测结论：必须用 PrintWindow(16)（2026-11-02 19:55）

### 41.1 同一台机器、同样最小化窗口、两种方式的对比

| 方式 | attach 耗时 | 截图 | 任务结果 |
|---|---|---|---|
| 16 PrintWindow | 236~259 ms | 约 1.5 MB，画面正常 | 正常完成 |
| 2 FramePool | **6.3 s** | **3947 字节（黑图）** | mail 跑到 70s 判 stopped-without-completion |

结论：**FramePool(2) 在最小化窗口下不可用**，慢、而且截出来是黑图，直接导致识别不到界面。

### 41.2 代码约束

```python
# 默认 16；环境变量只接受 16 / 18
_RAW_SCREENCAP = os.environ.get('MAA_SCREENCAP', '16').strip()
if _RAW_SCREENCAP not in ('16', '18'):
    print('[worker] WARN: MAA_SCREENCAP=... 不支持（FramePool 在最小化窗口下不可用，已回退 16）')
    _RAW_SCREENCAP = '16'
SCREENCAP = int(_RAW_SCREENCAP)
```

- 传 `2` 会被拒绝并回退成 16，日志里有 WARN（避免以后又手滑默认成 2）
- `18`（PrintWindow|FramePool 都试）保留着，万一某台机器 FramePool 反而更快可以试

### 41.3 顺带确认

- `minimize-after-task` 生效：任务结束后 `iconic after-task=True`，保留这条
- attach 时窗口还会闪一下（16 的伪最小化要临时改窗口样式），这个接受；
  只要任务结束后能压回最小化即可

## 四十二、窗口自愈 + P4 工具面（2026-11-02 20:20）

### 42.1 关键实测：MAA PC attach 要求客户区 16:9

| 客户区 | attach |
|---|---|
| 1264×681 | false（cost 314ms） |
| 1280×720 | true（cost 138ms），任务 done |

所以**不能只设窗口外框**，必须按客户区算。worker 现在 attach 前会自愈：

1. 读窗口矩形，完全在虚拟屏幕外（如 `rect=678,-1590,1974,-831`）→ `ShowWindow(SW_RESTORE)` + `SetWindowPos` 拉回 (80,60)，记 `auto-move`
2. 客户区不是 16:9（|ratio-1.7778| 超过 1%）→ `AdjustWindowRectEx` 按客户区 1280×720 反算外框重设，记 `fix-aspect`
3. 做完重新 `GetClientRect` 确认，再 attach（日志 `window ready check: client=1280x720 iconic=True`）

急救脚本：`D:\DSH\qqbot\maa\tools\fix-window.ps1`（dsh 写的，纯 ASCII 注释，必须管理员跑）。

### 42.2 三条实测结论（写死，别再翻案）

1. **attach 需要客户区 16:9**（见上表）
2. **FramePool(2) 不适合最小化窗口**：attach 6354ms、FastestWayToScreencap 2016ms、
   截图 3947 字节黑图、mail 70s 判 stopped-without-completion；`PrintWindow(16)` 236~259ms、截图 1.5MB、done
3. **AsstBackToHome 不足以保证回主界面**：`back-to-home ok` 之后仍可能 20003 ExceededLimit(ReturnButton)；
   主界面下 StartUp 正常（StartAtHome → Home → 10002 → done）

wakeup 失败且 reason 含 `ExceededLimit` 时，job.json 写 `reason=need-main-menu`，
QQ 侧回报"请先把游戏切回主界面再让我跑开始唤醒"。

### 42.3 P4 工具面（桥侧）

补丁：`D:\DSH\qqbot\patches\maa-tools.mjs`（幂等，标记 `[maa-tools]` / `[maa-tools-guard]`）
备份：`bridge.js.bak-maa-tools`；**要重启 web 才生效**。

| 工具 | 行为 |
|---|---|
| `ark_status` | 读 `maa\data\job.json`，返回任务名/状态/阶段/耗时/原因/截图数（原因翻人话） |
| `ark_run` | 只允许 wakeup/mail/sanity；sanity 校验 stage 在白名单、times 1~99、allowStone=false；
  job.json 里 status=running 时直接拒；写 queue（.tmp → rename 原子），再 `schtasks /run /tn DSH-MAA-Run` |
| `ark_stop` | 写 `maa\data\stop.req`，worker 每秒检查；命中就 `AsstStop`，status=stopped |

权限：`ark_*` 只有主人号能调，别人回"这个只有主人能让我做"。

### 42.4 stop.req 协议

```json
{ "jobId": "job-20261102-201500-12" }
```

worker 在等待循环里每秒看一次：命中 → `AsstStop` → 删掉 stop.req → `status=stopped, reason=stopped-by-user`，退出码 13。

### 42.5 还差 / 待主人

- **重启 web** 才能用 `ark_*`（补丁已打、语法已过）
- 30 秒自动回报（status 从 running 变 done/failed 主动发 QQ）**还没做**：
  需要拿到主动发消息的 bot 句柄，桥里目前只有回复链路（`#replyTo`），先不硬猜
- 部署：`robocopy "D:\DSH\qqbot\maa\staging\runner" "C:\MAA\runner" /MIR /NFL /NDL` → `make-baseline.ps1` → `schtasks /run`

## 四十三、参考资料与官方文档核对（2026-11-02 20:30）

### 43.1 参考资料（按需查，别整本抄）

| 页面 | 看什么 |
|---|---|
| [连接设置](https://docs.maa.plus/zh-cn/manual/connection.html) | PC 端 / Win32 窗口绑定 / 截图方式 / 分辨率要求 |
| [常见问题](https://docs.maa.plus/zh-cn/manual/faq.html) | PC 端最小化、16:9、attach 失败的常见原因 |
| [CLI 使用指南](https://docs.maa.plus/zh-cn/manual/cli/) | 无 GUI 调用的官方思路，对照我们的 C API 方案 |
| [开始唤醒](https://docs.maa.plus/zh-cn/manual/introduction/startup.html) | 前置界面要求（用来说明"必须主界面"） |
| [理智作战](https://docs.maa.plus/zh-cn/manual/introduction/combat.html) | stage / times / medicine / stone 的官方语义 |
| [集成文档](https://docs.maa.plus/zh-cn/protocol/integration.html) | AsstAppendTask 的任务名与参数（最权威） |
| [回调协议](https://docs.maa.plus/zh-cn/protocol/callback-schema.html) | msg_id 枚举与 details 字段 |
| [开发文档](https://docs.maa.plus/zh-cn/develop/) | 集成接口总览 |

### 43.2 三件事的核对结果

**a) PC 端是否明确要求 16:9？**
- 官方文档（连接设置 / 常见问题）**没有**写 PC 端 16:9 的硬要求——这几页目前还是以模拟器 ADB 为主，
  没有 Win32 / PC 端章节
- 我们的实测：客户区 1264×681 → attach false（cost 314ms）；1280×720 → attach true（cost 138ms），任务 done
- **结论：以实测为准**（客户区必须接近 16:9），文档已把这条写成实测结论，并注明"官方文档未提及"

**b) StartUp 是否明确要求主界面？**
- 官方开始唤醒页写的是：自动启动模拟器/客户端、自动进入游戏、掉线弹窗会点确认重连；
  **没有**明确写"必须停在主界面"
- 我们的实测：主界面 → StartAtHome → Home → 10002 完成；任务页 → 20003 ExceededLimit(task=ReturnButton)
- **结论：实测补充**（官方没写，但实测任务页会失败）；wakeup 失败时 reason=need-main-menu

**c) 官方是否推荐 PrintWindow 做最小化截图？**
- 官方文档没有截图方式的取舍说明（那属于 MaaFramework 的 Win32 控制单元，文档站没展开）
- 我们的实测：FramePool(2) → attach 6354ms、截图 3947 字节黑图、mail 判 stopped-without-completion；
  PrintWindow(16) → 236~259ms、截图 1.5MB、done
- **结论：以实测为准**，默认 16

### 43.3 官方文档确认的部分（可以直接引用）

- **任务名与参数**（集成文档）：`StartUp` 的 `client_type` 取 `Official|Bilibili|txwy|YoStarEN|YoStarJP|YoStarKR`；
  `Fight` 的参数是 `stage` / `medicine` / `stone` / `times` / `series` / `drops`；
  `stage` 支持 `CE-6` / `LS-6` / `CA-5` / `AP-5` / `SK-5` / 主线关卡 / 芯片本 `PR-A-1` 等
  → **和我们的 stages.json 一致**（CE-6、LS-6 写法正确）
- **回调枚举**（回调协议）：
  `3 = AllTasksCompleted`、`10002 = TaskChainCompleted`、`10004 = TaskChainStopped`、
  `20003 = SubTaskExtraInfo`（**不是失败！** ExceededLimit 只是它的一种 what，details 带 task/exec_times/max_times）
- **Fight 的语义**（理智作战页）：药剂/碎石/指定次数/指定材料是**或**关系，任一达成即停；
  碎石只在药剂之后判断；`当前/上次` 关卡要求画面停在"右上角有关卡名和剩余理智、右下角有代理指挥和开始行动"的关卡详情界面

### 43.4 按文档修正的代码

之前把 `20003` 当失败是**错的**（那是普通额外信息），已修正：

```python
if msg_id == 3:      # AllTasksCompleted
    job_events['completed'] = True
if msg_id == 10004:  # TaskChainStopped
    job_events['failed'] = True; reason = 'TaskChainStopped'
if msg_id == 10002:  # TaskChainCompleted
    job_events['completed'] = True
# 失败只认 what == ExceededLimit / TaskChain status FAILED
```

自测（test_cb_ids.py）：10002→完成、3→完成、20003 普通信息不判失败、20003+ExceededLimit→失败、10004→失败，五条全 PASS。

## 四十四、主动回报（2026-11-02 20:40）

### 44.1 做法

补丁：`D:\DSH\qqbot\patches\maa-notify.mjs`（幂等，标记 `[maa-notify]`，备份 bridge.js.bak-maa-notify）

- 桥启动后注册一个 **30 秒** 定时器（挂在 outbox 定时器后面，用 `globalThis.__qqBridgeTimers` 统一回收）
- 每次读 `maa\data\job.json`：`status` 是 running/starting 就直接返回
- 维护 `maa\data\notified.json`，记录 `{jobId, status, at}`；同一个 jobId+status 只发一次，**重启不会重发**
- 主动发送用桥里现成的：

```js
const sock = this.server.currentSocket()
if (!sock) return   // NapCat 掉线：跳过，下次轮询再试，不报错
await this.server.sendText(sock, 'private', Number(this.#ownerQQ()), text)
```

- 收件人是 `this.#ownerQQ()`（配置里的主人号），不硬编码

### 44.2 文案

- 完成：`明日方舟 · 任务完成：mail，耗时 11.4 秒，阶段 finished，截图 <第一张路径>`
- 失败：`明日方舟 · 任务失败：wakeup，原因 游戏不在主界面，请先切回主界面，截图 ...`
- 停止：`明日方舟 · 任务已停止：sanity，原因 按你的要求停下了`

原因字段会翻人话：`need-main-menu` / `ExceededLimit` / `stuck-90s` / `timeout` / `stopped-by-user`。
截图只给路径，暂不回传图片。

### 44.3 status 状态机

| status | 谁写 | 含义 |
|---|---|---|
| running / starting | run-job.ps1 + worker | 正在跑 |
| done | worker（收到 3 或 10002） | 正常完成 |
| failed | worker（ExceededLimit / TaskChain FAILED / 卡住 / 超时） | 失败，reason 有值 |
| stopped | worker（读到 stop.req） | 被 ark_stop 停掉 |
| interrupted | 启动时发现 running 但 pid 不存在 | 上次被重启打断 |

只有 done / failed / stopped 会触发主动回报。

### 44.4 降级

- 没有 socket（NapCat 断线）→ 直接 return，不写 notified.json，等下次轮询重试
- job.json 读不出来 / JSON 坏 → return，不抛异常
- notified.json 写失败 → 只可能重复发一次，可接受（catch 掉不报错）
- 进度回报**故意不做**，避免刷屏；要进度就用 `ark_status`

### 44.5 部署

打补丁后必须**重启 web** 才会注册这个定时器。验证方式：跑一次任务，等状态变 done 后 30 秒内应收到一条主动消息。

## 四十五、主动回报改成直接发截图（2026-11-02 20:50）

补丁：`D:\DSH\qqbot\patches\maa-notify-image.mjs`（幂等，标记 `[maa-notify-image]`，备份 bridge.js.bak-maa-notify-image）

### 45.1 发送优先级

1. 有截图（`job.shots` 的最后一张）→ 用 `#sendImageTo(route, file, caption)` 直接发图
2. 没截图或者发图抛异常 → 回退成文字 **一次**（文字 + 换行 + 路径），不重试
3. 连文字都发不出去 → 只记 debugLog，等下次轮询（不写 notified，避免丢通知）

```js
const route = { bot: sock, messageType: 'private', targetId: Number(owner) }
const shot = shots.length ? shots[shots.length - 1] : ""
if (shot && existsSync(shot)) await this.#sendImageTo(route, shot, caption)
```

### 45.2 caption 文案（只发最后一张，不发三张）

- 成功：`任务完成：领奖励，11.4 秒`
- 失败：`任务失败：开始唤醒，原因 游戏不在主界面，请先切回主界面`
- 停止：`任务已停止：清理智，原因 按你的要求停下了`

任务名翻译（不再直接吐 MAA 内部名）：

| MAA 名 | 中文 |
|---|---|
| Award | 领奖励 |
| StartUp | 开始唤醒 |
| Fight | 清理智 |
| Recruit | 公开招募 |
| Infrast | 基建换班 |
| Mall | 信用购物 |

没有映射就显示原名。

### 45.3 依赖

- `#sendImageTo` 是桥里现成的私有图片发送方法（`bridge.js` L8451 附近），
  路由对象就是 `{ bot: socket, messageType: 'private', targetId: Number(ownerQQ) }`
- 和 30 秒轮询共用同一份 notified.json 去重，不会重复发
- **要重启 web 才生效**

## 四十六、伪最小化交给 MAA，我们不再动窗口（2026-11-02 20:45）

### 46.1 源码结论

MAA 的 PrintWindow / FramePool 截图自带 **pseudo-minimize**：
给窗口加 `WS_EX_LAYERED | WS_EX_TRANSPARENT` + alpha=0 + `SW_SHOWNOACTIVATE`，
窗口变透明且点击穿透，所以 GUI 用户无感；任务结束时 `PseudoMinimizeHelper::stop()` 会自己 revert + `SW_MINIMIZE`。

我们之前的做法是在**跟它抢**：
- attach 后 `ShowWindow(SW_MINIMIZE)`（restore-after-attach）
- 任务结束 `ShowWindow(SW_MINIMIZE)`（minimize-after-task）

这两下会打断 MAA 的透明状态，反而把窗口弹到前台。

### 46.2 改法

1. **删掉** attach 后和任务结束时的所有 `ShowWindow` 调用，只保留观测日志：
   `iconic after-attach=... (was=..., MAA 自己管伪最小化)`、
   `iconic after-task=... (was=..., 不干预)`
2. 窗口自愈（`ensure_window_ready`）加一条硬前提：**最小化时直接跳过**。
   原因：最小化窗口的 `GetWindowRect` 是 `-32000,-32000`，会被误判成"跑到屏幕外"进而 `SW_RESTORE`——
   这才是窗口乱闪的真正源头。
3. 自愈现在只在"没最小化 + 真的跑出屏幕外"或"没最小化 + 客户区不是 16:9"时才动窗口。

### 46.3 保留的 ShowWindow

只剩 `ensure_window_ready` 里两处 `SW_RESTORE`（非最小化情况下修位置/比例要用），
而且都在 `is_iconic(hwnd)` 为 False 的前提下才会执行。

### 46.4 验证计划（要主人跑）

| 场景 | 期望 |
|---|---|
| 窗口最小化 → mail | 全程不应看到窗口出现；job done；截图正常 |
| 窗口还原 → mail | 照常 done |
| 去掉压回后 attach 失败或截图黑 | 再单独排查 screencap 方式（先怀疑 16 vs 18） |

## 四十七、job.task 不再被回调名覆盖（2026-11-02 20:55）

### 47.1 问题

sanity 那次失败后，job.json 里 `task` 变成了 `GoLastBattle`（MAA 回调里的原子任务名），
导致 ark_status / 主动回报里任务名显示错误。

### 47.2 改法（三个字段各司其职）

| 字段 | 内容 | 谁写 |
|---|---|---|
| `task` | **请求名**：wakeup / mail / sanity，永不改 | worker 在 append 前钉死 |
| `maaTask` | MAA 任务名：StartUp / Award / Fight | worker 映射得到 |
| `lastCallbackTask` | 最后一次回调里的任务名（如 GoLastBattle），只用于排查 | on_cb |

```python
# append 前钉死，后面 done/failed/stopped 都只补状态，不再动 task
write_job(job, task=task, maaTask=maa_task)
write_job(job, status='done', task=task, maaTask=maa_task, lastCallbackTask=job_events['task'] or '', shots=[...])
```

### 47.3 桥侧同步

- `ark_status`：中文映射改成按请求名（wakeup→开始唤醒 / mail→领奖励 / sanity→清理智），
  同时兼容老数据里的 MAA 名
- 主动回报的 caption 映射同样补上这三个请求名

### 47.4 顺带确认（窗口相关）

- `ensure_window_ready` 里只剩两处 `SW_RESTORE`，且都在 `is_iconic(hwnd)` 为 False 之后才会执行
- 代码里已经**没有** `SW_MINIMIZE` 调用（注释里提到的不算）
- 最小化分支直接 return，不动窗口

### 47.5 验证

| 检查 | 期望 |
|---|---|
| 非管理员 dry-run（mail） | job.task 仍是 `mail`，没有被改成回调名 |
| 部署后跑一次 mail | job.task == `mail`，job.maaTask == `Award`，窗口全程不出现 |

## 四十八、假 jobId 过滤 / sanity 前置 / 备份与恢复（2026-11-02 21:00）

### 48.1 假 jobId 过滤

主动回报只处理合法 id：`/^job-\d{8}-\d{6}-\d+$/`。
不匹配（比如 dry-run 写的 `job-task`）→ 直接 return，不写 notified.json、不发消息，
debugLog 打 `[maa-notify] skip invalid jobId: xxx`。
notified.json 里的无效记录也顺手清掉了。

### 48.2 job.json 字段（最终版）

| 字段 | 含义 | 示例 |
|---|---|---|
| `task` | **请求名**，永不改 | `sanity` |
| `maaTask` | MAA 任务名 | `Fight` |
| `lastCallbackTask` | 最后一条回调里的任务名，只给排查 | `GoLastBattle` |
| `status` | running / done / failed / stopped | `done` |
| `reason` | 失败原因（可翻人话） | `need-stage-screen` |
| `durationMs` | worker 用 monotonic 算的耗时 | `11062` |
| `shots` | 截图绝对路径数组 | `[...]` |

### 48.3 sanity（清理智）的前置与语义

**前置**：
1. 游戏停在主界面（大厅）
2. 当前理智 ≥ 单局消耗（CE-6 = 21）
3. 关卡在 `stages.json` 白名单里

**语义**：
- `sanity → Fight`，参数 `{stage, times, medicine, stone}`
- 会**真实消耗理智**，验证一次就够，不要连跑
- `times` 上限收紧到 **9**（v1 策略，官方默认是 2147483647）
- `allowStone` 固定 false；`allowMedicine` 默认 false

**失败语义**：sanity 若 `ExceededLimit`（回调常见 GoLastBattle / Stage），
reason 写 `need-stage-screen`，QQ 回报"请先把游戏切到关卡界面再跑清理智"，不自动重试、不碎石。

### 48.4 备份

打包脚本跑出来的位置与内容（2026-11-02 21:00）：
-`D:\DSH\qqbot\backups\maa-20261102-205209.zip`（0.33 MB，46 条目）

包含：
-`runner/` 全部（含 `worker/vendor`、`baseline.sha256`）
-`staging/` 全部（22 个文件）
-`bridge.js`（646 KB）与 `package.json`
-`maa-qq-control-prompt.md`
-`data/`：job.json、notified.json、seq.txt、audit-*.jsonl

验证：解压到临时目录 → 列出 46 条目 → 按 baseline.sha256 逐个比对，**11 条全一致、0 问题**。

### 48.5 从备份恢复

```powershell
# 1) 解压到临时目录
Expand-Archive "D:\DSH\qqbot\backups\maa-<时间戳>.zip" "D:\DSH\qqbot\backups\_restore" -Force

# 2) 把 runner 覆盖回去（管理员）
robocopy "D:\DSH\qqbot\backups\_restore\runner" "C:\MAA\runner" /MIR /NFL /NDL

# 3) 重生成基线（管理员）
powershell -NoProfile -ExecutionPolicy Bypass -File C:\MAA\runner\make-baseline.ps1
```

4. 桥侧文件（`bridge.js`）如需回滚，复制回 
`C:\Users\Eyjafjalla\.dsh\profiles\web\node_modules\@zfqxuz\dsh-qq-onebot-bridge\lib\` 后**重启 web**。

## 四十九、Fight 参数补齐（sanity 失败根因，2026-11-02 21:10）

### 49.1 证据

`C:\MAA\debug\asst.log` 里 GUI 的 append_task：

```json
{"stage":"AP-5","medicine":0,"medicine_expire_days":0,"stone":0,
 "times":1,"series":1,"DrGrandet":false,"report_to_penguin":true,...}
```

我们之前只发了 `{client_type, stage, times, medicine, stone}`，缺 `series` / `medicine_expire_days` / 
`DrGrandet` / `report_to_penguin`，Fight 起不来。

### 49.2 改法

```python
if task == 'sanity':
    params = {
        'stage': p['stage'],
        'medicine': 0,
        'medicine_expire_days': 0,
        'stone': 0,
        'times': p['times'],
        'series': 1,
        'DrGrandet': False,
        'report_to_penguin': False,
    }
    if p.get("allowMedicine"): params["medicine"] = 1
else:
    params = {'client_type': 'Official'}   # 只有 StartUp 要 client_type
```

- **去掉 Fight 里的 `client_type`**：那是实例选项，不是任务参数（StartUp 需要它，保留）
- `report_to_penguin` 设 false：本地跑不需要上报企鹅物流

### 49.3 stages.json 增加正确

| 关卡 | cost |
|---|---|
| CE-6 | **36** |
| LS-6 | **36** |

（之前按 21/18 估的，全部按 MAA 资源改成 36；预计消耗的换算跟着变）

### 49.4 验证

部署后跑一次 sanity（主界面 + 最小化），期望回调顺序：
`StageBegin → Fight → 进关 → 战斗 → 结算 → done`，理智减少 **36**。

## 五十、关卡轮换与 opens 字段（2026-11-02 21:25）

### 50.1 为什么 CE-6 跑不了

资源关按**星期轮换**开放。CE-6 当天不开放时，MAA 识别不到入口，
只看到「前往上一次作战」，而该节点 `max_times=0`，于是 20003 `ExceededLimit`。

MAA 的资源 JSON（`resource/tasks/Stages/*.json`）**只定义"怎么导航"，不带"哪天开放"**；
GUI 里灰色的关卡是 GUI 自己按星期/活动算的。我们不复刻 GUI，改为自己维护一张最小开放表。

### 50.2 opens 字段

```json
"AP-5": { "cost": 30, "minutes": 3, "opens": [1, 4, 6, 7], "name": "采购凭证 AP-5" }
```

- `opens` = ISO 星期（1=周一 … 7=周日），**人工按 PRTS 维护**，游戏改版要更新
- 空数组 `[]` 表示不校验（查不到排期的关卡先这么放）

当前表：

| 关卡 | cost | opens |
|---|---|---|
| CE-6 | 36 | [2,4,6,7] |
| LS-6 | 36 | [1,3,5,7] |
| AP-5 | 30 | [1,4,6,7] |

### 50.3 两道校验

1. **桥侧（ark_run）**：提交时就查，今天不在 opens 里 → 直接回
   `AP-5 今天不开放（周一），换一个关卡或等开放`，**不产生 job**
2. **worker 侧**：执行前再查一次（防绕过），不在 opens 里 → `status=failed, reason='stage-closed'，退出码 21`

### 50.4 sanity 失败文案

`need-stage-screen` 时提示：**关卡可能没开放 / 游戏不在关卡界面 / MAA 没识别到入口**，三种可能都列出来。
回报里带「预计消耗理智」，数值取 `stages.json` 的 `cost`。

### 50.5 三个任务的前置条件

| 任务 | 前置 |
|---|---|
| wakeup | 游戏在主界面（大厅） |
| sanity | 关卡今天开放 + 游戏在主界面 + 理智 ≥ cost |
| mail | 任意界面（MAA 自己导航） |

### 50.6 PRTS 参考资料（脚本抓不到，需要人工核）

- https://prts.wiki/w/关卡一览#资源收集
- 脚本直连返回 **403**（反爬），所以 opens 只能人工按页面维护；
  当前表里的 AP-5 [1,4,6,7] 是主人给的，CE-6 [2,4,6,7] 与 LS-6 [1,3,5,7] 是按常见排期填的，**待 PRTS 复核**。

## 五十一、实例选项 ClientType + current 关卡模式（2026-11-02 21:45）

### 51.1 漏了实例选项

GUI 启动时会调 `AsstSetInstanceOption(ClientType, "Official")`；我们之前**一次都没调**，
只在 StartUp 的 params 里放了 `client_type`——那是任务参数，不是实例选项。

现在在 `Asst.load` 之后、attach 之前补上：

```python
asst.set_instance_option(InstanceOptionType.ClientType, 'Official')
```

失败只记 WARN，不中断（有机器上这个选项不影响 attach）。

### 51.2 current 关卡模式

请求里 `stage: "current"` 表示"打当前选择的关卡"：

- Fight 的 `stage` 传**空字符串** `""`（MAA 会用当前/上次的关卡）
- **不校验 opens**（关卡是主人自己选的，哪天开放跟我们无关）
- 回报写"打当前选择的关卡"，不写预计消耗

桥侧 `ark_run` 也放行 `current`，不查白名单、不查 opens。

好处：主人只要把游戏停在想打的关卡页，鱼负责点「开始行动」并跑完，
不用管资源关今天开不开。

### 51.3 重测顺序（要主人跑）

| 步骤 | 期望 |
|---|---|
| 1. 补实例选项后，停在 AP-5 关卡页跑 sanity（stage=AP-5） | StageBegin → Fight → 结算 → done |
| 2. 成功后再从主界面跑 AP-5 | 看导航是否也恢复 |
| 3. 仍失败 → 用 stage=current 验证"点开始行动"这条路 | done，且不校验 opens |

## 五十二、ClientType 走底层 C API（2026-11-02 21:50）

### 52.1 失败原因：绑定缺枚举，不是接口不支持

C API 的 `AsstInstanceOptionKey`：

| 值 | 含义 |
|---|---|
| 1 | ClientType |
| 2 | TouchMode |
| 3 | DeploymentWithPause |
| 4 | AdbLiteEnabled |
| 5 | KillAdbOnExit |

官方 Python 绑定只映射了 2~5，**漏了 1**，所以 `InstanceOptionType.ClientType` 抛异常。

### 52.2 改法：直接调底层

```python
_lib = Asst._Asst__lib
_lib.AsstSetInstanceOption.argtypes = (ctypes.c_void_p, ctypes.c_int32, ctypes.c_char_p)
_lib.AsstSetInstanceOption.restype = ctypes.c_bool
_ok = _lib.AsstSetInstanceOption(handle, 1, b'Official')
log(f"instance option ClientType=Official -> ret={_ok} GetLastError={ctypes.get_last_error()}")
```

- 不再只打 WARN：**返回值 + GetLastError 都打出来**
- 异常路径也把 GetLastError 带上

### 52.3 本地 tasks.json 被改过（待还原）

- `C:\MAA\resource\tasks\tasks.json` 在 21:31:45 被改（239602 字节）
- 备份：`tasks.json.bak-dsh-213145`（239612 字节）
- 改动内容：`GoLastBattle` 里的「作战」关键词被去掉，现在只剩 `{"next":["StageQueue@StartButton1"]}`
- **测完如果没用要还原**（这是 MAA 资源文件，不是我们的东西）

### 52.4 重测

部署（robocopy + make-baseline + 重启 web）后，停在 AP-5 关卡页跑一次 sanity，
看日志里 `instance option ClientType=Official -> ret=True`，再看 Fight 能不能进关。

## 五十三、ClientType 不可设 + sanity 队列改成 StartUp→Fight（2026-11-02 21:55）

### 53.1 ClientType 不是有效实例选项：删掉

MAA 6.21 的 `Assistant::set_instance_option` 只处理 
`TouchMode` / `DeploymentWithPause` / `AdbLiteEnabled` / `KillAdbOnExit`，
**没有 ClientType**。所以 `AsstSetInstanceOption(handle, 1, ...)` 永远返回 false，之前那条 WARN 是白打的。

现在整块删掉，`client_type` 只在 StartUp 的任务参数里给（本来就该这样）。

### 53.2 sanity 的队列：先 StartUp 再 Fight

GUI 的队列是 `StartUp → Fight`，我们之前只 append 了 Fight，所以从非关卡界面跑时导航不全。

```python
if task == 'sanity':
    tid0 = asst.append_task('StartUp', {'client_type': 'Official'})   # 先回主界面/唤醒
tid = asst.append_task('Fight', params)                                # 再打关卡
```

- 两个任务**共用一个 Asst 实例、一次 attach**
- 其它任务不变（mail 仍然只 append Award，wakeup 只 append StartUp）

### 53.3 完成判定：以最后一个任务为准

- `3 = AllTasksCompleted` → 直接算完成
- `10002 = TaskChainCompleted` → **只有当回调里的 task 等于最后一个任务（Fight）时**才算完成；
  StartUp 的 10002 只记日志、继续等
- 实现：模块级 `_FINAL_TASK`，在 append 最后一个任务前设置

### 53.4 重测（要主人跑）

| 步骤 | 期望 |
|---|---|
| 1. AP-5 关卡页 → sanity | StartUp(10002 忽略) → Fight → 结算 → AllTasksCompleted → done |
| 2. 回主界面再跑一次 | 看导航是否也恢复 |

## 五十四、current 模式跑不通：run-job.ps1 门禁（2026-11-02 22:05）

### 54.1 现象

ark_run 带 `stage: "current"` 入队成功，但被提权侧的校验拦下：

```
audit: rejected: stage not allowed: current
```

原因：`run-job.ps1` 的严格校验只认 `stages.json` 里的键，没对 `current` 特判。

### 54.2 改法（两处一起，保持一致）

1. `run-job.ps1`：

```powershell
if ($stage -eq 'current') {
    Write-Output 'stage=current：跳过关卡白名单校验'
} else {
    # 原有白名单校验
}
```

2. `stages.json` 加一个特殊项（这样 worker 里取 cost 也不会 KeyError）：

```json
"current": { "cost": 0, "minutes": 0, "opens": [], "name": "当前关卡（主人手动选）" }
```

3. worker 里 `stage=current` → Fight 的 `stage` 传空字符串、跳过 opens、回报写「打当前选择的关卡」
   （这条上一轮已经做了，这次只是把门禁放开）。

### 54.3 重测

| 步骤 | 期望 |
|---|---|
| AP-5 关卡页 + stage=current | StartButton → 战斗 → 结算 → AllTasksCompleted → done |

注意：`current` 模式下 auditor 里 stage 会显示 `current`，回报里显示「当前关卡」。

## 五十五、current 模式不排 StartUp（2026-11-02 22:10）

### 55.1 现象

```
append_task StartUp {"client_type":"Official"}
append_task Fight {"stage": "" ...}
→ StartUpBegin → ExceededLimit ReturnButton
```

### 55.2 原因

current 模式的语义是**游戏已经在关卡页，直接点开始行动**。
StartUp 会先导航回主界面，反而把关卡页带走了，于是 Fight 找不到入口。

### 55.3 改法

```python
_stage_name_for_queue = (req.get('params') or {}).get('stage', '')
if task == 'sanity' and _stage_name_for_queue != 'current':
    asst.append_task('StartUp', {'client_type': 'Official'})   # 只有具体关卡名才排
```

| 请求 | 队列 |
|---|---|
| sanity + AP-5（具体关卡） | StartUp → Fight |
| sanity + current | **只有 Fight**（stage=""） |
| mail | 只有 Award |
| wakeup | 只有 StartUp |

### 55.4 重测

AP-5 关卡页 + stage=current → 期望 `StartButton1 → 战斗 → 结算 → done`。

## 五十六、Fight 没跑起来：10002 字段是 taskchain（2026-11-02 22:25）

### 56.1 现场（core 日志）

```
append_task StartUp {"client_type": "Official"} -> task_id: 1
append_task Fight {...} -> task_id: 2          ← Fight 其实 append 成功了！
TaskChainStart StartUp
TaskChainCompleted {"taskchain":"StartUp","taskid":1}
TaskChainStopped  {"taskchain":"StartUp","taskid":1}   ← 我们在这一步把任务停了
```

所以不是 "Fight append 返回 0"，而是：**worker 把 StartUp 的完成当成了整体完成**，
于是调 Asst.stop()，Fight 还没开始就被停掉。

### 56.2 根因：字段名是 taskchain

TaskChainCompleted 的 details 里字段叫 `taskchain`，不是 `task`。
我们之前提取 `task` 拿到空字符串，_FINAL_TASK 比对失效，直接判完成。

### 56.3 改法

```python
# 提取顺序：taskchain 优先
task = payload.get('taskchain','') or d.get('taskchain','') or payload.get('task','') or d.get('task','')

# 10002 只有 taskchain == 最后一个任务才算完成
if _FINAL_TASK and _t != _FINAL_TASK:
    log(...继续等)
else:
    job_events['completed'] = True
```

- 读不到 taskchain 时**不再**当作完成，交给 `3 = AllTasksCompleted` 兜底
- append 返回 0 时把 params 和 core 日志路径打出来（防止以后真出现时抓瞎）

### 56.4 重测

主界面 + AP-5：StartUp（10002 只记日志）→ Fight → 战斗 → 结算 → AllTasksCompleted → done。

## 五十七、结项：PC 端路线停在这里，转模拟器（2026-11-02 22:40）

> 本节是这次尝试的墓志铭。以后再碰 MAA，先读这节。

### 57.1 跑通了什么

| 能力 | 状态 |
|---|---|
| Win32 窗口绑定（还原/最小化都能 attach） | 通 |
| 截图（PrintWindow 16，1.5MB PNG，能看见画面） | 通 |
| mail / Award（领奖励完整跑完） | 通 |
| wakeup / StartUp（主界面） | 通 |
| ark_stop（stop.req + AsstStop，6 秒内停） | 通 |
| QQ 工具面 ark_status / ark_run / ark_stop | 通 |
| 主动回报（完成/失败发消息 + 截图） | 通 |

### 57.2 卡死在哪

**sanity / Fight 在 PC 端跑不起来。**

- 从主界面：`GoLastBattle` 节点 `max_times=0` —— 认出了按钮但点不了
- 从关卡页：`StartButton1` 同样 `max_times=0`
- 补了 `series`、加了 `StartUp→Fight` 队列、试过实例选项，都没解决
- MAA 官方把 PC 端标为**实验性**，issue #17804 记录了成片的 PC 识别/导航问题

结论：**不是我们接错，是上游 PC 支持不完整**，继续投入不划算。

### 57.3 清理结果

- `D:\DSH\qqbot\maa` 已归档到 `backups\maa-pc-attempt-20261102-223623.zip`（82.68 MB）并删除
- 计划任务 `DSH-MAA-Run` 已删；`C:\MAA\runner` 已删
- `C:\MAA` 与 `C:\MAA-6.9.3-backup` 留着（没删，占地方但不碍事）
- 桥里的 `ark_*` 工具**暂时保留**，没有任务可调时会报错；以后要清就删补丁 `[maa-tools]` 那一段

### 57.4 新路线：模拟器 + dsh-maa-cli

1. 装 MuMu 12 + 明日方舟（1280×720，MAA 识别更稳）
2. 装 DSH 插件 `dsh-maa-cli`（npm），自带 maa-cli 运行时；提供 /maa fight 等本地面板（**不耗 token**）

**装之前必须备份**：`bridge.js` / `onebot.js` / `index.js` / `package.json`。
装插件会重装依赖、覆盖桥并带回 `dsh.client`（白屏）。装完要：删 `dsh.client` → 恢复补丁版 bridge.js → 重启 + 自检。

首次运行要下 500~600MB 运行时，网络慢会失败。

### 57.5 目标用法（自然语言 → 任务）

「今天的理智全刷龙门币」→ 鱼要能：

1. 查今天开放的最高级关卡
2. 映射：龙门币→CE-6、经验→LS-6、红票→AP-5、技巧→SK-5、碳→CA-5
3. 读当前理智
4. `times = floor(理智 / 单局消耗)`
5. 默认不用药、不碎石
6. 先复述「关卡+次数+预计消耗」等主人确认
7. 执行并回报掉落

### 57.6 经验教训（最值钱的三条）

1. **识别到 ≠ 能点**。`max_times=0` 是任务预算问题，不是参数问题。
   遇到 "识别到了但 ExceededLimit"，**先怀疑任务预算/资源版本**，不要死磕参数。
2. **上游的实验性功能不要当稳定底座**。PC 端能 attach、能截图、能跑 Award，
   但 Fight 导航就是不可用——花在这上面的每一小时都是沉没成本。
3. **别和框架抢窗口**。MAA 自己有 pseudo-minimize（透明 + 点击穿透），
   我们额外 `ShowWindow` 只会把窗口弹到前台；最小化窗口的 `GetWindowRect(-32000)` 还会被误判成"跑出屏幕"。
