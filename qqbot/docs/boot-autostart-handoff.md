# 开机自启与语音/音乐端口交接（2026-11-06 00:10）

## 明天回来先看这个

### 唯一自启入口

```
HKCU Run: DSH-Boot
  → powershell -File D:\DSH\qqbot\scripts\boot-start.ps1
```

旧的 `DSH-TTS-Proxy` / `DSH-Music-Proxy` 两条 Run 已删除（它们并行执行、无顺序保证）。

`boot-start.ps1` 顺序：

1. 等网卡拿到 `172.30.x.x` 网关（最多 120 秒）
2. `campus-login.ps1` 登录 Dr.COM（最多 12 轮，每轮 15 秒）
3. 检测百度 443 通不通；不通就继续重试登录
4. 起 9998 语言网关（`start-tts-proxy.ps1`）
5. 起 9999 音乐网关（`D:\DSH\sing\start-music.ps1`）
6. 通网才起 QQ bot 栈（`start-stack.ps1 -Boot -NoBrowser`），断网则跳过

日志：`D:\DSH\qqbot\logs\boot-start.log`、`campus-login.log`

### 校园网

- 门户：`http://172.30.255.42/`（Dr.COM eportal 4.0）
- 登录接口：`http://172.30.255.42:801/eportal/portal/login`
- 账号：452865
- 凭据：`D:\DSH\qqbot\data\campus-cred.dat`（DPAPI CurrentUser 加密，262 字节）
- 重置凭据：
  `powershell -File D:\DSH\qqbot\scripts\set-campus-cred.ps1 -User 452865 -Pass 新密码`
- 已验证：在线时返回 `ret_code:2`（已在在线）按成功处理；离线时应返回 `result:1`

### 端口

| 端口 | 用途 | 自启 |
|---|---|---|
| 9998 | 语言网关（TTS） | boot-start 第 4 步 |
| 9999 | 音乐网关（SVC） | boot-start 第 5 步 |
| 10000 | 纯烬 v2Pro | 9998 按需 |
| 10001 | 纯烬 v4 (GPU) | 9998 按需 |
| 10002 | 隐德来希 v2Pro | 9998 按需 |
| 10003 | 隐德来希 v4 (GPU) | 9998 按需 |
| 10010 | 本兮 SVC（r0，CPU） | 9999 按需 |

注册表：`D:\DSH\ports.json`；说明：`D:\DSH\PORTS.md`

### 旧任务已禁用

- `DSH-TTS-Start`（会起 9880 旧服务）→ Disabled
- `DSH-TTS-GPU`（9880 ZLUDA）→ Disabled
- `DSH-QQBot-Start` → 仍 Disabled（改由 boot-start 调 start-stack）

### 明天待验证

1. 重启（或注销重登）后看 `boot-start.log` 是否走完四步
2. 校园网离线场景未实测：可以手动执行 `campus-login.ps1` 看 `result:1`
3. bot 栈由 boot-start 拉起是否正常（原来任务是 Disabled）
4. 桌宠需重启一次才会读到 `DSH_PET_TTS_BASE=http://127.0.0.1:9998`

### 音乐服务

- 网关：`D:\DSH\sing\music_proxy.py`（9999）
- 后端：`D:\DSH\sing\svc_server.py`（10010）
- 环境：`D:\DSH\sing\svc_env212`（torch 2.1.2+cpu + so-vits-svc-fork 4.1.61）
- 接口：`POST /convert`（multipart：file / transpose / f0_method / cluster_ratio）
- 实测：8 秒音频冷启动 12.8s、热 2.8s（RTF≈0.35）

---

## 2026-11-06 14:05 更新：登录策略与实测

### 登录策略（已按主人要求改）

1. 每 3 秒试一次，**共 5 次**（约 15 秒）
2. 失败后弹窗：
   - 标题：校园网登录失败
   - 内容：失败原因（从 portal 返回的 msg 解析）+ 手动登录提示
3. 弹窗后**不再自动登录**，只每 5 秒轮询联网状态（最多 60 分钟）
4. 检测到联网 → 继续起语音和 bot

不会因为反复试密码锁号。

### 密码实测：PASS

```
14:04:16  登出成功（Portal 协议注销）
14:04:22  确认离线
14:04:33  PASS password accepted, network restored
```

- 账号 452865 / 密码 01111911 正确
- 登出到恢复约 17 秒
- **DSH 自身依赖网络**：测试必须用独立脚本跑（`scripts\test-campus-password.ps1`），本体会在断网期间失去模型连接

### 相关文件

```
scripts\campus-login.ps1         登录（5 次 × 3 秒，写失败原因）
scripts\boot-start.ps1           开机编排（等 IP → 登录 → 弹窗/轮询 → 语音 → bot）
scripts\show-alert.ps1           弹窗（读 UTF-8 文本文件，避免 PS 5.1 乱码）
scripts\test-campus-password.ps1 独立测试：登出→登录→验证
data\campus-cred.dat             DPAPI 加密凭据
data\campus-alert-title.txt      弹窗标题（UTF-8）
data\campus-alert-template.txt   弹窗正文模板（{reason} 占位）
logs\campus-login.log            登录日志
logs\campus-password-test.log    本次验证记录
```

### 注意

- 弹窗中文来自 UTF-8 文件，脚本本体保持纯 ASCII（PS 5.1 读无 BOM UTF-8 会乱码）
- 密码错误时不要反复手动重试，5 次后按流程等弹窗