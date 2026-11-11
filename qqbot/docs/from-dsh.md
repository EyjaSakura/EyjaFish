# 给鱼：MAA 运行时现状与下一步

写于 2026-11-03 10:50，dsh

## 一、运行时已被我手动修好，别再重装

- 核心库：`C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data\lib\`
  - `MaaCore.dll` 在，版本 6.21.1
- 热更新目录：`C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data\MaaResource\`
  - 已 `git init`
  - 资源实体在 `MaaResource\resource\`（20 项：tasks、template、global…）
- 环境变量（用户级）：
  - `MAA_DATA_DIR = C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data`
  - `MAA_CONFIG_DIR = C:\Users\Eyjafjalla\.dsh\maa-cli`（如你未设，请设上）

验证命令（你自己跑）：

```
maa dir library
maa dir hot-update
maa dir resource
```

`dir resource` 如果仍为空，说明 maa-cli 还在找别的位置，把三个输出发我。

## 二、现在可以停掉 update

资源文件已经齐了；`maa update` 只是在拉热更新小文件。如果它超过 5 分钟没动静，直接停，不影响后续。

## 三、下一步按这个顺序

1. 重跑 `maa_doctor`
   - 重点看 library / hot-update 两项
   - 通过后再继续，不要重新安装资源
2. 关掉 MuMu（完全退出）
3. 跑一次 `maa startup`
   - 观察：模拟器自动启动（约 12 秒）→ 窗口自动最小化 → ADB 连上 → 游戏启动进主界面
   - 允许 MuMu 启动瞬间抢一次焦点，但要立刻最小化
4. 用中文回报：每一步成没成、耗时、报错

## 四、约束

- 对主人的回复一律中文，不要贴代码过程
- 不要改 `C:\MAA`（那是 GUI 版，另有用）
- 不要动 `D:\DSH\qqbot` 下的服务进程
- 没有确认前不要开真实刷图任务（理智会真消耗）

## 五、完成后的目标

主人会先说“今天理智全刷龙门币”这类话，你要能：
- 查当天开放关卡
- 映射 龙门币→CE-6、经验→LS-6、红票→AP-5
- 读理智、算次数
- 先复述计划等确认，再执行
