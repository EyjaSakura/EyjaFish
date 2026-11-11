# 本地插件化说明（v2026-11-06）

这个目录是 `@zfqxuz/dsh-qq-onebot-bridge` 的**本地插件副本**，不再是 `node_modules` 里的散装补丁。

## 部署结构

```
D:\DSH\plugins\dsh-qq-onebot-bridge\       ← 插件本体（本目录）
D:\DSH\plugins\node_modules\               ← junction → profile 的 node_modules（依赖解析）
C:\Users\Eyjafjalla\.dsh\profiles\web\node_modules\@zfqxuz\dsh-qq-onebot-bridge
                                            ← junction → 本目录
```

DSH 仍按 `@zfqxuz/dsh-qq-onebot-bridge` 这个名字加载，但代码实际住在 `D:\DSH\plugins`。

## 为什么这样做

- 代码可版本化、可单独备份，不再埋在 `node_modules` 里
- 升级 npm 包时，先把本目录备份/对比，再决定合并
- 插件本体有完整 `package.json`、`cordis.patch.yml`、README

## 恢复 / 回退

```powershell
# 回退到 npm 原包
Remove-Item 'C:\Users\Eyjafjalla\.dsh\profiles\web\node_modules\@zfqxuz\dsh-qq-onebot-bridge' -Force
# 然后 npm install（或从 D:\DSH\qqbot\backups\bridge-modular-2026-11-06 恢复 lib）
```

## 当前状态

- bridge.js：997 行（49 个公开薄包装迁到 `lib/services/bridge-facade.js`）
- 设计注记：`docs/bridge-design.md`（从源码移出的 JSDoc）
- 29 个业务模块（见 `lib/`）
- 冻结备份：`D:\DSH\qqbot\backups\bridge-modular-2026-11-06\`
- 近期回滚点：`D:\DSH\qqbot\backups\plugin\plugin-20261110-2354.zip`

## 设计注记（从 bridge.js 移到文档）

- **persona 兜底**：preset 的 persona 若写 `complete: true`，DSH 会替换整个 system prompt，
  桥接注册的规则段会被丢掉。因此 QQ 人设由 `persona-corpus-runtime` 按角色注入，
  解析优先级：`chat-<key>.md → chats[key] → <role>.md → <role> → default.md → default`，最后追加 `extra`。
- **服务获取**：不能写 `ctx.get(n) ?? ctx[n]`；`ctx[name]` 对未声明服务会抛。
  正确入口是 `ctx.reflect.get(name, false)`，失败一律当"取不到"，绝不冒泡。
- **群运营命令**：`/群资料` 已被基础群信息占用，扩展信息走 `/群详细`；
  写操作必须过 ActionGate，命令空白分隔；注入/回放回合不写 QQ（`injectDryRun:false` 除外）。
- **权限两段判定**：工具注册看 `tool.chat.*`；真正出站前还要按 `qq.write.*` 再判一次，
  避免“注册了就能发”的假安全。主体：命令按发言人，会话能力面按会话。
- **开发群**：整群 owner 会在启动日志醒目打印，便于事故时确认是哪个群被放开。
- **群图片落盘**：必须 at 机器人且 `groupImageView` 未关闭；否则群友图片不会自动进上下文。
- **重启清积压**：注入延迟队列全清；待发队列只留 30 分钟；抖音 inbox 未读超 20KB 跳游标。

## 还没做的（真正的 DSH bundle 注册）

现在只是「本地插件目录 + junction」，profile 的依赖声明仍是 `@zfqxuz/dsh-qq-onebot-bridge@0.7.2`。
要让 DSH 的 `plugin_manager` 正式接管（安装、升级、禁用都走面板），需要：

1. 改包名（例如 `@fish/dsh-qq-bridge`）避免与原包冲突
2. 用 `plugin_manager install_bundle` 安装
3. 在 profile 里禁用原 `@zfqxuz/...` 行，避免两个 bridge 同时连 QQ

这一步会改 profile 状态，建议单独安排。
