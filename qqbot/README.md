# 大肥鱼运行工作区

本目录是**运行与数据工作区**，源码在 `D:\DSH\plugins`。

## 先读

- 全量工程标准：`docs/ENGINEERING-STANDARD.md`
- 快速索引：`docs/ENGINEERING.md`
- 测试门禁：`docs/TESTING.md`
- 源码说明：`D:\DSH\plugins\README.md`

## 目录

```text
D:\DSH\qqbot\
  data\        运行数据（记忆、权限、归档、文件）
  scripts\     CI / 部署 / 健康检查 / 审计
  deploy\      NapCat 与服务部署
  docs\        工程文档
  backups\     快照、回滚包、历史 .bak
  logs\        运行日志
  tools\       本地工具链
  archive\     历史归档
  assets\      静态资源
  persona\     人设文件
  plugins\     （源码在 D:\DSH\plugins，不在此处）
```

## 常用命令

```powershell
# 全量 CI
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\ci.ps1

# 健康检查
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\health.ps1

# 部署 / 回滚
powershell -File D:\DSH\qqbot\scripts\deploy.ps1 -Action deploy
powershell -File D:\DSH\qqbot\scripts\deploy.ps1 -Action rollback
```

## 规则

- 源码只放 `D:\DSH\plugins`。
- 运行数据、日志、备份只放本目录。
- 不在源码目录保留 `.bak`；历史 `.bak` 已移到 `backups\source-bak-20261110`。
- 每次改动跑 CI + health，并更新 `小鲸鱼自检记.txt`。
