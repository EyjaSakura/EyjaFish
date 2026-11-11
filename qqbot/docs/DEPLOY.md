# 部署与回滚

本文件是部署/回滚/健康检查的唯一操作文档。`DEPLOYMENT.md` 已合并到这里，只保留指向本文的说明。

## 1. 运行形态

```text
QQ / NapCat
  → 反向 WS 6700
  → DSH Web 13080（加载 bridge 插件）
  → feature-loader 扫描 D:\DSH\plugins\features
```

- 插件源码：`D:\DSH\plugins\dsh-qq-onebot-bridge`
- feature 源码：`D:\DSH\plugins\features\<name>`
- 数据：`D:\DSH\qqbot\data`
- 日志：`D:\DSH\qqbot\logs`
- 配置：`C:\Users\Eyjafjalla\.dsh\profiles\web\cordis.patch.yml`

## 2. 部署

```powershell
# 快照 + 重启 + 健康检查
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\deploy.ps1 -Action deploy

# 只打包，不重启
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\deploy.ps1 -Action deploy -NoRestart

# 预演，不写文件
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\deploy.ps1 -Action deploy -DryRun

# 查看快照
powershell -NoProfile -ExecutionPolicy Bypass -File D:\DSH\qqbot\scripts\deploy.ps1 -Action list
```

快照：

```text
D:\DSH\qqbot\backups\plugin\plugin-YYYYMMDD-HHmmss.zip
```

内容为 bridge 插件目录全部文件，不含运行时 data。

维护已接入 `health-watchdog`（每 24 小时最多一次）；也可以手动 dry-run：

```powershell
# 日志 > 20MB 轮转，保留 3 份
powershell -File D:\DSH\qqbot\scripts\rotate-logs.ps1
powershell -File D:\DSH\qqbot\scripts\rotate-logs.ps1 -Apply

# plugin 快照保留最新 8 份，旧的移到 backups\archive\plugin
powershell -File D:\DSH\qqbot\scripts\prune-backups.ps1
powershell -File D:\DSH\qqbot\scripts\prune-backups.ps1 -Apply
```

## 3. 手动启动 / 重启

```powershell
node "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\lib\bin.js" web --port 13080 --no-open
```

只重启 Web，不动 WSL/NapCat，避免 QQ 重新扫码。

重启后必须：

```powershell
powershell -File D:\DSH\qqbot\scripts\health.ps1
```

## 4. 回滚

```powershell
# 回滚 bridge 插件到最近快照
powershell -File D:\DSH\qqbot\scripts\deploy.ps1 -Action rollback
```

边界：

- `robocopy /MIR`：插件目录里新增但备份中没有的文件会被删除
- 只取最新一个快照；要更早的，先手动调整目录或扩展脚本
- feature 代码不在 bridge 快照里，单独存：

```text
D:\DSH\qqbot\backups\features\features-*.zip
```

恢复 feature 时按目录覆盖，再重启。

## 5. 健康检查

```powershell
powershell -File D:\DSH\qqbot\scripts\health.ps1
```

判定：

| 检查 | 判据 |
|---|---|
| 端口 | 13080 / 6700 在监听 |
| QQ | runtime snapshot 的 `botOnline === true`（不是只看 6700 listen） |
| 运行时快照 | `C:\Users\Eyjafjalla\qq-runtime.json` 180 秒内更新 |
| 插件 | status.json 中没有非 loaded/disabled 项 |
| 磁盘 | D 盘剩余 ≥ 5GB |

输出 `HEALTH OK` 才算通过。

## 6. 掉线通知

```text
DSH-QQBot-Health   SYSTEM 任务，每 2 分钟
  → health-watchdog.ps1
  → notify-push.ps1
  → Server酱 / ntfy / Telegram / webhook
```

配置：

```text
D:\DSH\qqbot\data\notify-config.json
```

测试：

```powershell
powershell -File D:\DSH\qqbot\scripts\notify-push.ps1 -Test
```

整机失联（关机/断网/蓝屏）另配外部心跳：

```text
D:\DSH\qqbot\data\heartbeat-config.json
{ "url": "https://hc-ping.com/<check-uuid>" }
```

看门狗健康时 ping 成功路径；失败时 ping `<url>/fail`。当前已配置 `healthchecks.io` 的 `DSH QQ Bot`，并通过 ntfy 推手机。

无人登录也要运行：

```powershell
# 管理员 PowerShell
powershell -File D:\DSH\qqbot\scripts\install-health-task.ps1
```

不碰 QQ 的测试告警：

```powershell
# 管理员 PowerShell；1 分钟后由 SYSTEM 发一次
powershell -File D:\DSH\qqbot\scripts\install-health-task.ps1 -TestAlert
```

## 7. 插件停用 / 启用

编辑 `D:\DSH\plugins\features\disabled.json`：

```json
["douyin"]
```

重启 Web 生效；`status.json` 会显示 `disabled`。恢复即删除该文件或去掉名字。

## 8. 改完代码的自测

```powershell
powershell -File D:\DSH\qqbot\scripts\ci.ps1
```

包含：

```text
audit → lint → bridge api → bridge size → no-undef
→ deploy smoke → unused vars → typecheck
→ core/services tests + coverage → all-lib coverage
→ syntax
```

## 9. 常见问题

- **6700 被占**：多半是旧 web 进程没退；结束 node 后重启
- **插件没加载**：看 `dsh-web.err.log` / `dsh-web.out.log` 的 `[feature] loaded`
- **QQ 不回**：先看 `C:\Users\Eyjafjalla\qq-bridge-debug.log`，再跑 health
- **发图超时**：必须 base64 内联发送，不能传本地路径
- **health 报 qq:bot-online**：NapCat 掉线或 bridge 未收到 connect；检查 NapCat，不要只看端口
