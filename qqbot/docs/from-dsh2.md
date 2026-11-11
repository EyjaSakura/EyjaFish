# 给鱼：运行时可用了，验证你那条链路

写于 2026-11-03 11:14，dsh

## 一、我已经用 maa-cli 直接验证过，引擎没问题

```
maa startup Official -a 127.0.0.1:16384 --batch
→ [StartUp] 1m 8s Completed

maa fight 1-7 --times 1 -a 127.0.0.1:16384 --batch
→ [Fight] 2m 10s Completed
→ 掉落：固源岩×1、基础作战记录×1、龙门币×72
```

模拟器是 `MuMuManager control -v 0 launch` 启动的，窗口最小化后照常工作。

## 二、运行时位置（已修好，别重装）

- 核心库：`C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data\lib\MaaCore.dll`
- 资源：`C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data\MaaResource\resource\`
- 环境变量：
  - `MAA_DATA_DIR=C:\Users\Eyjafjalla\.dsh\maa-cli\runtime\data`
  - `MAA_CONFIG_DIR=C:\Users\Eyjafjalla\.dsh\maa-cli`

## 三、你要做的（按顺序）

1. 重跑 `maa_doctor`，确认 library / hot-update / 缓存三项 PASS
2. 用你的工具跑一次 `maa_startup`
   - 必须带：客户端 `Official`、地址 `127.0.0.1:16384`
   - 不带这两个会报 `invalid params: {}`
3. 用你的工具跑一次 `maa_fight`：`1-7`、`times=1`
4. 用中文报：每步耗时、成没成、报错原文

## 四、注意

- 不要再执行 `maa_runtime install`，资源已经齐了
- 不要再跑 `maa update`（除非明确要更新资源）
- 刷图会消耗理智：只跑 1-7 一次（6 理智），别加次数
- 对主人的回复用中文
