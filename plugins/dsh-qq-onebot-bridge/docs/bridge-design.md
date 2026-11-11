# bridge.js 设计注记（从源码移出）

/**
 * Core bridge: routes QQ messages into native Harness agent sessions and
 * streams assistant replies back over OneBot.
 */

关联：`import { createHash } from 'node:crypto'`

/**
 * 「我已被撤管理员」这条判断的保鲜期（v0.5.8）。
 * 来源只有 group_admin 事件；万一下一次变更的事件没收到，不能让这条过期信息
 * 永久拦住写命令，所以超过这个时长就按"不知道"处理（交给 API 自己去试）。
 */

关联：`const BOT_ADMIN_TTL_MS = 10 * 60_000`

/** 通过通用 registerFeature 注册的工具名（默认只给主人）。 */

关联：`const FEATURE_TOOLS = new Set()`

/** [本地补丁 联网搜索] 最小可用的 web_search / web_fetch（web 服务由调用方闭包传入）。 */

关联：`function sessionPrefix(key) {`

    /** 运行快照心跳间隔（毫秒）；测试会调小它来验证"空闲也有新鲜快照"。 */

关联：`this.runtimeHeartbeatMs = 60_000`

  /**
   * Subscribe to a bridge-server event and return a REAL disposer.
   * (EventEmitter#on returns the emitter, so pushing its result into `disposers`
   * made stop() throw "dispose is not a function".)
   */

关联：`#onServer(event, handler) {`

  /**
   * 历史归档的保留期清理：过期分片**移入** qq-trash/<date>/，绝不直接删除
   * （与图片清理同一套"never destroy"约定）。
   */

关联：`#pruneArchive() {`

  /** Start a trace for a notice/request event (no message id). */

关联：`beginEventTrace(kind, event) {`

  /**
   * Machine-readable runtime snapshot (`qq-runtime.json`) so the standalone
   * console — a different process — can show live session/gate/trace state.
   * Throttled: at most one write every 2 seconds unless `force`.
   */

关联：`writeRuntimeSnapshot(force = false) {`

  /**
   * Effective feature flags (never secrets) — the console shows these so
   * "为什么这个功能没生效" is answerable without reading the profile YAML by hand.
   */

关联：`featureFlags() { return this.#featureFlags() }`

  /** Forget a chat's persisted memory (used by /new). */

关联：`clearMemory(key) {`

  /** 重复提醒的下一次排程（复用原 id，保持 /reminders 列表干净）。 */

关联：`#rescheduleRecurring(rem) {`

  /**
   * 这条群消息是不是靠"文本 at 名字"算作 at  了机器人？
   * 返回命中的名字（写进 trace），没有则空串。只在正文真的含 `at ` 时才去学/判，开销可忽略。
   */

关联：`async textMentionName(message) {`

  /** /health：主机与插件运行状况一览。 */

关联：`async handleHealth(message) {`

  /** /export：把本会话持久化记录导出为 markdown 文件。 */

关联：`async handleExport(message) {`

  /** OneBot notice 事件分发：戳一戳 / 入群欢迎 / 撤回。 */

关联：`async #onNotice(notice) {`

  /** 防撤回：把撤回的内容补发到群里（或私聊管理员）。 */

关联：`async handleRecallNotice(notice) {`

  /** 敏感词 / 刷屏拦截。返回 true 表示这条消息已被处理，不再进入模型。 */

关联：`async handleContentFilter(message, text) {`

  /** OneBot request 事件（加群/加好友）：入群验证开启时登记并推送管理员，否则只记日志。 */

关联：`async #onRequest(request) {`

  /** 私聊推送一条文本给所有管理员（用于请求审批等）。 */

关联：`async notifyAdmin(text) {`

  /** 管理员审批命令：/同意 N、/拒绝 N、/同意 all、/待审。 */

关联：`async handleVerifyCommand(message, cmd) {`

  /** 这一回合是不是注入/回放（离线）回合。 */

关联：`#offlineTurn(source) {`

  /**
   * 审批类写操作要不要跳过：离线回合 **且** 不是 `injectDryRun: false`（"真发"模式）。
   * 与 `#engageWriteBlocked`、`/群打卡` 等处口径一致——调试开关要能真的把动作放出去，
   * 否则"注入里试一次真发"这条路在审批上就走不通了（独立审查提的 P2）。
   */

关联：`approvalOffline(source) {`

  /**
   * 执行一次审批（走写操作闸门）。
   *
   * 两条独立红线（v0.5.8）：
   * 1. **注入/回放回合绝不真的批准任何人**：`set_group_add_request` 的参数里只有 `flag`，
   *    没有 group_id/user_id，落不进 scoped dry-run 的拦截条件——这跟 v0.5.1 修的
   *    `/ocr`、`/好友` 是同一类洞，所以必须显式判断，不能指望 dry-run 兜底。
   * 2. **可疑好友申请只能同意**：真机探针确认 `set_doubt_friends_add_request` 会忽略
   *    `approve`（源码注释「该字段没有语义 仅做保留 强制为True」），所以对这类条目
   *    必须拒绝执行"拒绝"，而不是假装拒绝成功。
   */

关联：`async resolveJoin(entry, approve, { offline = false } = {}) {`

  /** 申请人答对验证题时自动放行（管理员也可手动 /同意）。返回 true 表示已消费该消息。 */

关联：`async handleJoinAnswer(message, text) {`

  /** 定期清理超时的待审批请求并提醒管理员。 */

关联：`#startVerifySweeper() {`

  /** 戳一戳：白名单会话内被戳时随机回一条卖萌文案（每会话限频）。 */

关联：`/** engageEnabled 总闸 + 某个子开关（子开关在构造函数里集中读进 this.engageSwitches）。 */`

  /** engageEnabled 总闸 + 某个子开关（子开关在构造函数里集中读进 this.engageSwitches）。 */

关联：`engageOn(key) {`

  /**
   * 注入/回放回合里，互动写操作要不要跳过。
   *
   * 与 #injectedTaskBlocked 同一口径：只有 `injectDryRun !== false`（默认的干跑模式）才拦；
   * 用户显式配 `injectDryRun: false`（"注入并真发"）时照常执行。
   * 之所以要在这里再判一次，是因为 `set_msg_emoji_like` 这类调用**参数里没有会话键**，
   * scoped dry-run（按 chatKey 拦截）根本拦不住它——不能指望那一层兜底。
   */

关联：`engageWriteBlocked(target) {`

  /** 注入/回放回合拦住写操作时统一的真实 reason。 */

关联：`engageBlockedReason(what) {`

  /**
   * 每条入站消息的被动互动：标记已读 + 自动贴表情（两个都默认关）。
   *
   * 红线在这里体现得最集中：
   * - `set_msg_emoji_like` / `mark_*_msg_as_read` 都是写操作 → 一律过 ActionGate + 出站配额；
   * - 贴表情的调用**只带 message_id、不带任何会话键**，所以注入/回放回合它自己判
   *   `__injected/__replayed` 并给出真实 reason（不能指望 scoped dry-run 兜底）；
   * - 被拦下/未启用都写 trace，绝不静默。
   */

关联：`async engagePassive(message, mark) {`

  /**
   * 私聊「正在输入」的开始（typingEnabled，默认关）。
   * 真机探针：NapCat 的 set_input_status 只拼 C2C 会话，群聊没有这个能力，
   * 所以群聊里如实记 reason，不白发一次注定失败的调用。
   */

关联：`async typingStart(message) {`

  /** 回复落地后撤销「正在输入」；只有真的发过才开始撤销（避免无谓调用）。 */

关联：`async typingStopFor(route) {`

  /**
   * 私聊「正在输入」的底层调用。注入/回放回合不发（纯表演性质的状态，干跑没必要动真账号）。
   */

关联：`async #sendTyping(message, eventType) {`

  /** 入群欢迎：群成员加入时 at  新人 + 欢迎语（机器人自己入群不触发）。 */

关联：`async handleWelcome(notice) {`

  /** /help：命令帮助（按功能开关与管理员身份动态展示）。 */

关联：`async handleHelp(message) {`

  /** 签到排行榜。 */

关联：`async handleCheckinBoard(message) {`

  /** 私聊文件转存：下载用户发来的文件到 cwd/qq-files/。 */

关联：`async handlePrivateFiles(message) {`

  /** 主体 id：命令/动作按**发言人**判（群里可以分人），会话能力面按**会话**判。 */

关联：`subjectOfChatFor(message) { return subjectOfChatRuntime(message) }`

  /** /summary：把本会话的持久化聊天记录交给 agent 总结。 */

关联：`async handleSummary(message) {`

  /** 投票：start / show / end / count / publish。 */

关联：`async startVote(message, vc) {`

  /** Count a group message as a vote when it matches an active vote option. */

关联：`async maybeVote(message) {`

  /** 共享待办：/todo add|list|done|clear 与「记一下：xxx」。 */

关联：`async handleTodo(message, arg) {`

  /** 管理员命令：/mute /unmute /kick（二次确认）/clear + 群管套件（公告/精华/名片/头衔/全员禁言）。 */

关联：`async handleAdminCommand(message, cmd, arg) {`

  /** Drop this chat's live session handle, keeping persisted maps untouched. */

关联：`async #disposeSession(key) {`

  /** Resume the persisted session of this chat when possible, else create a fresh one. */

关联：`async #openSession(message, key) {`

  /** DSH 会话落盘根目录。 */

关联：`#workspaceSessionRoot() {`

  /** 本聊天当前绑定的工作区；未绑定返回 null。 */

关联：`workspaceBinding(key) {`

  /** 只有超管能切工作区（能力 cmd.workspace；guest 与群里默认角色一律拒绝）。 */

关联：`canSwitchWorkspace(message) {`

  /** /ws 命令：列表 / 切换 / 退出。返回 true 表示这条消息已作为命令处理。 */

关联：`async handleWorkspaceCommand(message, text) {`

  /** 打开绑定工作区的会话：先续接最新会话，失败就在该工作区新建一条。 */

关联：`async #openWorkspaceSession(message, key, binding) {`

  /** [本地补丁] 这个会话是不是本桥某个聊天绑定的会话？返回 {key, message}。 */

关联：`findChatForSessionById(sessionId) { return this.#findChatForSession(sessionId) }`

  /**
   * [本地补丁] 迁移契约消费者：收到 requested 后判断是否为自己的会话，是则认领并
   * **自己创建**接续会话（谁持有谁创建），注入 recall 摘要，重绑（#createSession 内部走
   * #bindSession，天然事务化），再广播 committed。失败广播 aborted，由插件决定是否自建。
   */

关联：`async #onTransferRequested(payload) {`

  /** [本地补丁] /handoff status 的文本：绑定 + live agent + 开关 + 最近生命周期 trace。 */

关联：`formatHandoffStatus(key) {`

  /**
   * [本地补丁] 读某个会话目录里日志的**首帧**，解出 header。
   * DSH 的 JSONL+zstd 是逐帧拼接的，zstdDecompressSync 默认只解第一帧，这里也只取第一帧；
   * 用不上 zstd（Node < 23）时安静降级。
   */

关联：`#readHeaderAt(dir) {`

  /** Role for one inbound message. */

关联：`roleOf(message) {`

  /** Create the role's working directory when missing (no-op for the owner). */

关联：`#ensureRoleCwd(role) {`

  /** Apply the role's permission preset (sandbox mode + approval policy). */

关联：`#applyRolePermission(handle, role) {`

  /**
   * [权限模型] 落地一个会话的工具面。
   *
   * 两类能力必须分别管，缺一不可：
   *   1. **宿主级（继承）工具** —— 用 `tools.restrict({ allow })` 白名单裁剪。
   *      只有"不是全都要"时才裁剪：全都要还去 restrict，等于把宿主以后新增的工具提前判死刑。
   *   2. **桥接 scoped 注册的工具**（受限读 / 联网 / qq_* / 生图）—— restrict 管不着它们，
   *      只能"没权限就不注册"。这也是"只读角色绝不复用旧会话"的原因（旧会话里可能留着上个
   *      preset 注册进去的 scoped 工具）。
   */

关联：`async applyToolSurface(agentCtx, route, key, role, surface) {`

  /**
   * 共享只读区的实际位置：资源 `dir:shared` 的 uri 优先（相对数据根解析），
   * 没有这条资源就用默认位置 `<dataRoot>/subjects/shared`。
   * 这样"资源与范围"页里改 uri 是真的能改到实际挂载点，而不是只改一行展示数据。
   */

关联：`#sharedRoot(policy = null) {`

  /**
   * 受限读工具（dsh-tool-fs-jailed）：根目录 = 该主体的目录；
   * 有 `tool.fs.read:shared` 权限再挂一个共享只读区，用 `shared/` 前缀寻址。
   */

关联：`async registerJailedFsTools(agentCtx, role, key, surface = null) {`

  /** [memory-v2] 只读检索工具：memory_search / memory_timeline（USE_V2 存在才注册） */

关联：`registerMemoryTools(agentCtx, key) {`

  /** System prompt + per-session tools. Runs for both fresh and resumed sessions. */

关联：`async #installSession(agentCtx, route, key, opts) {`

  /**
   * [权限模型] 把"这个会话按哪套权限面建的"写进 acl.db —— 控制台"生效与审计"页靠它回答
   * "哪些会话还在用旧能力面"。写失败只记 debug：审计数据不能拖垮会话。
   */

关联：`#recordAclSession(entry, surface, kind = 'created') {`

  /** Tools that let the agent act on QQ beyond plain text: media, voice, recall. */

关联：`/** 模块注入桥：私有方法走白名单，公共字段回落到实例本身。 */`

  /** 模块注入桥：私有方法走白名单，公共字段回落到实例本身。 */

关联：`/** 通用插件 API：给实现 registerFeature 的插件用，默认工具只给主人。 */`

  /** 通用插件 API：给实现 registerFeature 的插件用，默认工具只给主人。 */

关联：`#featureApi() {`

  /** [per-user] 识图是否对该消息发送者开启（全局 && 按号）。 */

关联：`visionOn(message) {`

  /** [live-perms] 按全局开关 + 按号表算出应禁用的工具名。 */

关联：`capabilityOffTools(surface) {`

  /** [live-perms] 每次调用时复核能力开关（全局 + 按号）。返回拒绝原因或 undefined。 */

关联：`liveCapabilityBlock(surface, exec) {`

  /** [self-tools] 改资料 / 空间 是否开启（全局）。 */

关联：`selfKindEnabled(kind) {`

  /** [self-tools] 改完通知主人（额外一条短消息）。 */

关联：`async notifyOwner(route, text) {`

  /** [contacts] 读联系人备注。 */

关联：`contacts() {`

  /** [contacts] 主人 QQ（配置优先，否则取 adminUsers 第一个）。 */

关联：`ownerQQ() {`

  /** 生图权限：主人 + 倩倩姐（QQ 2930661826）。 */

关联：`drawAllowed(subject) {`

  /** [contacts] 主人专属：列出她所有会话的最近活跃情况。 */

关联：`registerOwnerTools(agentCtx, route, key, role) {`

  /** Resolve + validate an outbound file path (contained, existing, size- and type-checked). */

关联：`resolveSendPath(raw, role) {`

  /** Send a local image (compressing oversized ones first) and remember the message id. */

关联：`/** 用 base64 内联发送图片：不依赖 NapCat 拉取本地路径，避免 send_private_msg 超时。 */`

  /** 用 base64 内联发送图片：不依赖 NapCat 拉取本地路径，避免 send_private_msg 超时。 */

关联：`async sendImageBuffer(route, buffer, caption = '') {`

  /** Compress an image with ffmpeg when it exceeds imageSendMaxBytes (best effort). */

关联：`async #prepareImageForSend(file) {`

  /** Upload a local file (group file list for groups, file message for private chats). */

关联：`async sendFileTo(route, file, name = '') {`

  /** Whether the configured TTS provider has everything it needs. */

关联：`ttsUsable() {`

  /** Synthesize and send a voice message on demand (agent tool / /读). */

关联：`async sendVoiceTo(route, text) {`

  /** Remember the newest outbound message ids so /撤回 and qq_recall can withdraw them. */

关联：`trackSent(chatKey, data) {`

  /** Withdraw the most recent outbound messages of this chat. Returns how many were withdrawn. */

关联：`async recallRecent(chatKey, count = 1) {`

  /** 关键词问答库：命中即回（不走模型、不需要 at ）。返回 true 表示已处理。 */

关联：`async handleKeyword(message, text) {`

  /** 今日人品 / 抽签 / 塔罗（本地确定性计算，零成本）。 */

关联：`async handleFortune(message, text) {`

  /** 骰子与随机选择（纯本地）。 */

关联：`async handleDice(message, text) {`

  /** 积分查询 / 排行榜 / 转账。 */

关联：`async handlePointsCommand(message, text) {`

  /** 发言得积分（每会话每日封顶；默认关闭）。 */

关联：`awardMessagePoints(message) {`

  /** 开始一局小游戏（成语接龙 / 猜数字）。 */

关联：`async handleGameCommand(message, text) {`

  /** 进行中的小游戏：直接吃下当前消息并推进状态机（免 at ，让群友顺畅接龙）。 */

关联：`async handleActiveGame(message, text) {`

  /** 记录一条发言（用于 /统计 与日报）；命令消息（/ 开头）不计入。 */

关联：`recordStats(message) {`

  /** /统计、/活跃榜、/周榜。 */

关联：`async handleStatsCommand(message, text) {`

  /** /mc <host[:port]>：查询 Minecraft Java 版服务器状态（只读，无外部依赖）。 */

关联：`async handleMcStatus(message, text) {`

  /** /日报 on|off：本会话是否接收每日群日报。 */

关联：`async handleDailyReportCommand(message, text) {`

  /**
   * 只读命令在回放/注入（dry-run）下拿到的不是数据，而是 `{message_id:'dry-N', dryRun:true}` 存根。
   * 把它当"空结果"处理会给出**误导性理由**（"群成员 共 0 人"/"没有找到匹配的群文件"），
   * 而真实原因是"这一轮不访问 QQ"——违反 v0.4 ①「每个降级分支都要给真实 reason」。
   */

关联：`dryRunAck(data) {`

  /**
   * 群成员查询的共用实现（只读）：/成员 命令与 qq_member_info 工具都走这里。
   * 返回 { ok, text, reason }，自身不发任何消息。
   */

关联：`async #queryGroupMembers(groupId, query) {`

  /** 群成员查询（只读）：/成员 列名单、/成员 at 某人（或昵称/QQ 号）看详情。 */

关联：`async handleMemberQuery(message, text) {`

  /** 群资料（只读）：/群信息。 */

关联：`async handleGroupInfo(message, text) {`

  /** 好友列表（隐私项，默认关闭；仅私聊里的管理员可用）。 */

关联：`async handleFriendList(message, text) {`

  /**
   * 历史检索（只读）：/找 关键词。搜本地归档（比 qq-inbox.jsonl 的轮转窗口大得多），
   * 只搜当前会话，多关键词是 AND。
   */

关联：`async handleHistorySearch(message, text) {`

  /**
   * 图片文字识别（只读）：/ocr —— 识别本条消息带的图片，或引用消息里的图片。
   * 走 NapCat 的 ocr_image，不消耗模型。
   */

关联：`async handleOcr(message, text) {`

  /**
   * 群文件（只读为主）：/文件 [文件夹名] 列目录、/取 <文件名> 下载一份交给发起人。
   * 下载一律发**私聊**，不往群里丢文件。
   */

关联：`async handleGroupFiles(message, text) {`

  /** 每日群日报：让 agent 总结当天聊天并发到群里。 */

关联：`#scheduleDailyReport() {`

  /** 本会话是否接收日报：显式配置 > /日报 on 的开关 > 群白名单兜底。 */

关联：`#dailyReportTargets() {`

  /** Auto-save image stickers from incoming messages into the face library. */

关联：`/** [pending-desc] 把本地表情存进 QQ 收藏（描述完成后再调用）。 */`

  /** [pending-desc] 把本地表情存进 QQ 收藏（描述完成后再调用）。 */

关联：`async saveFaceToQq(item) {`

  /** Resolve a quoted (replied-to) message into text lines the agent can understand. */

关联：`/** [qq-video] 保存 QQ 视频/视频文件消息到本地，并把路径交给模型。 */`

  /** [qq-video] 保存 QQ 视频/视频文件消息到本地，并把路径交给模型。 */

关联：`async handleIncomingVideo(message) {`

  /** [backfill] 上线后拉最近历史，补水位之后的消息。 */

关联：`async #backfillRecent() { return } // [backfill-off] 该版本没有公开 action API，补拉保持关闭（死代码已清理）`

  /** Download images/animated stickers from a private or at -mentioned group message; return a note and native image blocks. */

关联：`async downloadMessageImages(message) {`

  /** Extract the first frame of a GIF into a PNG beside it (for stable vision support). */

关联：`#extractGifFrame(file) {`

  /** Attach local image files as native multimodal content blocks (DSH attachment seam). */

关联：`async #imageBlocksFor(files) {`

  /** Transcribe an incoming voice message and feed the text into the agent. */

关联：`/**`

  /**
   * 展开合并转发（聊天记录）卡片：真实运行走 get_forward_msg 取节点列表；
   * 回放/注入（dry-run）下不访问 QQ，只有注入方提供了 forwardText 才有正文，否则给明确 reason。
   * 一切皆可调试：成功、截断、失败都会在调用方写一条 forward 阶段的 trace。
   */

关联：`async expandForwards(message) {`

  /**
   * 语音转文字入口：默认走 **DSH 自带的本地识别**（不外发），也可以配成云端（sttProvider: cloud）。
   * 两条路都返回纯文本；失败时抛出的原因已经是可以直接回给用户的中文。
   */

关联：`async transcribe(audio) {`

  /** Call the STT endpoint (OpenAI-compatible /audio/transcriptions). */

关联：`#onSessionEvent(session, event) {`

  /** 落盘播报去重状态（重启后不重复播报同一条）。失败只记日志，不影响主流程。 */

关联：`saveBroadcastState() { return this.#saveBroadcastState() }`

  /** 启动外部服务（入站 webhook 与定时播报）。两者默认关闭；启动失败必须留 reason。 */

关联：`#startExternalServices() {`

  /** 把互动状态落盘（每次统计变动/配额记录后调用；失败只记日志，不打断主流程）。 */

关联：`saveEngageState() { return this.engagementRuntime.saveEngage() }`

  /** 记一次运营事件（只在 groupOpsEnabled + opsReportEnabled 时生效，避免白写盘）。 */

关联：`countOps(kind, count = 1) {`

  /** 把 "g:123" / "u:456" 这类会话键翻成 #replyTo 需要的路由对象；非法键 → null。 */

关联：`#routeFromChatKey(chatKey) {`

  /**
   * 外部来源（入站 webhook / 定时播报）主动发消息。
   * 统一走 #replyTo：限流、注入窗口拦截、合并转发、出站记账都在那里；这里只补 trace reason。
   */

关联：`async deliverExternal(chatKey, text, stage) {`

  /** 入站 webhook：渲染 → 发送，失败分支各自留 reason。 */

关联：`async #onWebhookEvent({ source, payload }) {`

  /** mc 播报：复用既有 mcping 的解析与排版。 */

关联：`async #pingBroadcast(address) {`

  /** rss 播报：解析 + 关键词过滤 + 排版，返回文本与条目 id（交给 Broadcaster 去重）。 */

关联：`#formatBroadcastFeed(xml, job) {`

  /** /播报：列出定时任务与 webhook 状态，管理员可用「/播报 测试 <id>」立即触发一次。 */

关联：`async handleBroadcastCommand(message, text) {`

  /**
   * 互动命令（v0.5.3「点一下就完事」）：/戳 /点赞 /赞榜 /谁赞了。
   *
   * 红线：命令一律**空白分隔**（/戳123 不认）；写操作（戳、点赞）过 ActionGate + 出站配额；
   * `/赞榜` 纯本地读——注入/回放回合下它照常回答，并且 trace 里说明「读的是本地统计，不碰 QQ」；
   * `/谁赞了` 走 get_emoji_likes（**不带 group_id 的调用自己判注入/回放**），失败时才回落到本地统计并标注来源。
   */

关联：`async handleEngageCommand(message, text) {`

  /**
   * 掉线自愈：**只启动、绝不杀进程**。每次尝试都写 trace；受冷却与每小时上限约束。
   * 冷却/上限命中时也留 reason——「无人值守」不等于「静默什么都不做」。
   */

关联：`#tryAutoHeal() {`

  /** Push a status notification via the configured webhook (PushPlus or custom), with cooldown. */

关联：`notify(text) {`

  /**
   * 注入回合的整回合记账 + 按会话的出站拦截。
   *
   * 设计要点（都是真机/审计实测出来的）：
   *   - dry-run 不能是**服务器级**开关：注入窗口内到达的真人消息会被一起吞掉，
   *     而且那些被吞的调用还会被当成"注入会发的东西"上报。所以拦截改成按 chatKey。
   *   - 一个回合里模型可能产生**多条** assistant/message（每步一条，用工具的回合必然多步），
   *     所以拦截判定是"整回合"，不是"本回合第一条"。
   *   - 工具出站（发图/发文件/发语音/撤回）走的是 server 直连，不经过同步窗口，
   *     必须在工具入口单独查同一个判定。
   */

关联：`injectionSuppressed(chatKey) {`

  /** 被拦下的出站都要留一条事件（无静默分支）。 */

关联：`markSuppressed(chatKey, what, text = '', traceId = '') {`

  /** 注入帧被投递到会话之前/之后的同步窗口。 */

关联：`#beginInjectWindow(chatKey) { this.injectionRuntime.beginInjectWindow(chatKey) }`

  /**
   * 把一条用户内容交给 agent，并记下"这一回合是谁触发的"。
   *
   * 所有 followup 都必须经过这里：主消息路径、/summary、私聊语音、每日日报。
   * 漏掉任何一处，注入帧的那一回合就会被误判成真人回合 → 注入的模型回复直接发到 QQ。
   */

关联：`handoff(entry, message, payload) {`

  /**
   * 注入帧在同步阶段登记的**延时发送**（提醒 / 投票开奖）也要能拦：
   * 它们在窗口早已关闭之后才发，且提醒还会落盘、跨重启生效。
   */

关联：`#injectedTaskBlocked(record, what) {`

  /** Send text as a one-node merged-forward ("chat record") card. */

关联：`async sendForwardCard(route, text) {`

  /** Sliding-window outbound rate limiter (off unless rateLimitEnabled). Returns true when the reply must be dropped. */

关联：`/** [busy-notice] 忙时收到真人消息，先回一句“在忙”让对方知道没掉线。 */`

  /** [busy-notice] 忙时收到真人消息，先回一句“在忙”让对方知道没掉线。 */

关联：`async sendBusyNotice(message) {`

  /** [maa-notify] 30 秒看一次 job.json，任务从 running 变成 done/failed/stopped 就主动报一条。 */

关联：`async #maaNotifyTick() {`

  /** [inject-queue] 排队消息落盘文件。 */

关联：`/** [sticker-msg-map] 消息 id -> 表情名。 */`

  /** [sticker-msg-map] 消息 id -> 表情名。 */

关联：`#stickerMsgLink(messageId, name) {`

  /** [sticker-msg-map] 把最近一条出站消息关联到表情名。 */

关联：`linkLastSticker(chatKey, name) {`

  /** [quote-reply] 最近消息缓存：id / 角色 / 摘要。 */

关联：`pushRecentMsg(key, id, role, text) {`

  /** [quote-reply] 给模型的"可引用消息"清单。 */

关联：`recentBlock(key) {`

  /** [douyin-bridge] 读抖音私信，注入主人会话（注入回合文字被丢弃，回复走 douyin_send）。 */

关联：`#maybeStartupGreet() {`

  /** [activity] 记录当前活动，供面板显示。 */

关联：`setActivity(name) {`

  /** [qzone-poll] 每 N 分钟检查一次新评论，自动让她回复。 */

关联：`async pollQzoneComments() {`

  /** [qzone-autopost] 时间到了就让她"自己想发"一条说说（注入回合，不强制）。 */

关联：`async #maybeAutoPostQzone() {`

  /** Duplicate inbound message guard (NapCat reconnect re-delivery), on unless dedupEnabled=false. */

关联：`duplicate(message) { return this.duplicateGuard.isDuplicate(message) }`
