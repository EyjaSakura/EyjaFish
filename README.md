# EyjaFish

大肥鱼 / 小鲸鱼工程源码（source-only）。

## 目录

```text
plugins/dsh-qq-onebot-bridge/   QQ OneBot v11 ↔ DSH bridge
plugins/features/               14 个 feature 插件
qqbot/scripts/                  CI、部署、健康检查、e2e、通知
qqbot/docs/                     工程标准、部署、测试、ADR、历史归档
qqbot/data/*.example.json       配置模板（真实配置不进仓库）
```

## 不提交

```text
qqbot/data/        运行数据与密钥（除 *.example.json）
qqbot/logs/        运行日志
qqbot/backups/     快照与历史备份
qqbot/archive/     历史归档
node_modules/
*.bak*
```

## 常用门禁

```powershell
powershell -File D:\DSH\qqbot\scripts\ci.ps1
powershell -File D:\DSH\qqbot\scripts\health.ps1
```

## 当前基线

```text
bridge.js          997 非空行
bridge-facade.js   100% 覆盖
bridge core        21 tests；57 / 83 / 10（CI 阈值）
feature tests      71（14/14，覆盖 39.75/64.94/23.55）
test:new           202
```

## 说明

真实配置、QQ 号、token、cookies 只放在本机 profile / data，不进仓库。
