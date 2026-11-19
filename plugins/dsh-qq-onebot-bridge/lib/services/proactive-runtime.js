// Proactive behaviors: startup greet, douyin browse/spark, free-time activity,
// async analyze polling, douyin inbox polling, and stuck-turn reset.
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { pollDouyinInbox as pollDouyinInboxService } from './douyin-inbox.js'
import { maaNotifyTick as maaNotifyTickService } from './maa-notify.js'
import { debugLog } from '../core/debug-log.js'
import { nextActivityGapMinutes } from './activity-gap.js'

export { nextActivityGapMinutes }

export const GREET_WHITELIST_FILE = 'D:\\DSH\\qqbot\\data\\startup-greet-whitelist.json'
export const DEFAULT_GREET_WHITELIST = {
  owner: { id: '1815442184', name: '主人', locked: true },
  friends: [{ id: '2930661826', name: '倩倩姐', enabled: true }],
  policy: {
    owner: { hourFrom: 8, hourTo: 24, maxPerDay: 1 },
    friend: { hourFrom: 9, hourTo: 22, maxPerDay: 1, quietAfterUserMinutes: 120 },
  },
}

function readGreetWhitelist(owner) {
  let data = null
  try { data = JSON.parse(readFileSync(GREET_WHITELIST_FILE, 'utf8').replace(/^\uFEFF/, '')) } catch { data = null }
  if (!data || typeof data !== 'object') data = JSON.parse(JSON.stringify(DEFAULT_GREET_WHITELIST))
  const ownerId = String(owner || data.owner?.id || DEFAULT_GREET_WHITELIST.owner.id)
  data.owner = {
    id: ownerId,
    name: String(data.owner?.name || DEFAULT_GREET_WHITELIST.owner.name),
    locked: true,
  }
  data.friends = Array.isArray(data.friends)
    ? data.friends.filter((f) => f && /^\d{5,12}$/.test(String(f.id))).map((f) => ({
        id: String(f.id),
        name: String(f.name || f.id),
        enabled: f.enabled !== false,
      }))
    : []
  data.policy = { ...JSON.parse(JSON.stringify(DEFAULT_GREET_WHITELIST.policy)), ...(data.policy || {}) }
  return data
}

export function createProactiveRuntime({
  config,
  memoryDir,
  server,
  ownerQQ,
  contactsInfo,
  onQqMessage,
  handleInjection,
  transcribe,
  setInjectReplyTarget,
  features,
  sessions,
  flushDeferred,
  sendImageTo,
}) {
  let greetScheduled = false

  function localDay() {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }

  function maybeStartupGreet(attempt = 0) {
    const owner = ownerQQ()
    if (!owner) return
    const file = join(memoryDir, '..', 'qq-startup-greet.json')
    const today = localDay()
    let st = /** @type {{ lastDate?: string, greetedAt?: number, friends?: Record<string,string> }} */ ({})
    try { st = JSON.parse(readFileSync(file, 'utf8')) } catch { st = /** @type {{ lastDate?: string, greetedAt?: number, friends?: Record<string,string> }} */ ({}) }
    if (greetScheduled) return
    const whitelist = readGreetWhitelist(owner)
    const hour = new Date().getHours()
    const recipients = []
    if (st.lastDate !== today && hour >= Number(whitelist.policy.owner.hourFrom ?? 0) && hour < Number(whitelist.policy.owner.hourTo ?? 24)) {
      recipients.push({
        id: owner,
        name: whitelist.owner.name,
        level: 'owner',
        text: '【系统】你刚启动完成，给主人发一句问好的话：一句，自然点，不要提系统、不要解释。',
      })
    }
    for (const friend of whitelist.friends) {
      if (!friend.enabled || friend.id === owner) continue
      const already = st.friends?.[friend.id]
      if (already === today) continue
      if (hour < Number(whitelist.policy.friend.hourFrom ?? 9) || hour >= Number(whitelist.policy.friend.hourTo ?? 22)) continue
      recipients.push({
        id: friend.id,
        name: friend.name,
        level: 'friend',
        text: `【系统】给朋友「${friend.name}」发一句轻量问候：一句，自然点，不超过 30 字；不要提记忆、关系、主人、系统，不要追问，不要像定时汇报。`,
      })
    }
    if (recipients.length === 0) return
    const socket = server.currentSocket()
    if (!socket) {
      // Do not consume today's greeting while QQ/OneBot is not ready.
      if (attempt < 20) setTimeout(() => maybeStartupGreet(attempt + 1), 30_000)
      debugLog(`[startup-greet] waiting for socket (attempt ${attempt + 1}/21)`)
      return
    }
    greetScheduled = true
    recipients.forEach((recipient, index) => {
      setTimeout(() => {
        const liveSocket = server.currentSocket()
        if (!liveSocket) {
          greetScheduled = false
          if (attempt < 20) setTimeout(() => maybeStartupGreet(attempt + 1), 30_000)
          debugLog('[startup-greet] socket disappeared before send; retrying')
          return
        }
        // Record only after the socket exists; per-recipient so a friend never
        // consumes the owner's daily greeting (or vice versa).
        let current = /** @type {{ lastDate?: string, greetedAt?: number, friends?: Record<string,string> }} */ ({})
        try { current = JSON.parse(readFileSync(file, 'utf8')) } catch { current = {} }
        if (recipient.level === 'owner') current.lastDate = today
        else {
          current.friends ||= {}
          current.friends[recipient.id] = today
        }
        current.greetedAt = Date.now()
        try { writeFileSync(file, JSON.stringify(current), 'utf8') } catch { /* ignore */ }
        void onQqMessage({
          bot: liveSocket,
          messageType: 'private',
          userId: Number(recipient.id),
          groupId: null,
          messageId: `greet-${recipient.level}-${recipient.id}-` + Date.now(),
          text: recipient.text,
        }).catch((e) => debugLog(`[startup-greet] ${recipient.level} failed: ` + e.message))
        debugLog(`[startup-greet] queued ${recipient.level} ${recipient.id}`)
      }, 3000 + index * 3000)
    })
  }

  function maybeDouyinBrowse() {
    const hour = new Date().getHours()
    if (hour < 10 || hour >= 23) return
    const file = join(memoryDir, '..', 'qq-douyin-browse.json')
    let st = { nextAt: 0 }
    try { st = JSON.parse(readFileSync(file, 'utf8')) } catch { st = { nextAt: 0 } }
    if (Date.now() < (st.nextAt || 0)) return
    const gapMin = 120 + Math.floor(Math.random() * 120)
    st.nextAt = Date.now() + gapMin * 60_000
    try { writeFileSync(file, JSON.stringify(st), 'utf8') } catch { }
    const owner = ownerQQ()
    if (!owner) return
    const all = contactsInfo().all
    const ownerName = (all[ownerQQ()] && all[ownerQQ()].name) || '主人'
    const friendName = Object.values(all).filter((x) => x && x.name && x.role !== 'owner').map((x) => String(x.name)).slice(0, 2).join('、') || '朋友'
    const text = '【系统】可以去刷会儿抖音了（douyin_feed 看热点榜）。先判断' + ownerName + '和' + friendName + '各自喜欢什么（用 qq_contact_taste 读最近的聊天），再挑视频：适合谁就 douyin_share_video 发给谁：' + ownerName + ' peer 填「薇薇安要碎觉」，' + friendName + ' peer 填「倩倩姐」或「别管.」；两个都喜欢就各发一份；都不喜欢就不发。 // [taste-nicknames]不想刷就忽略，不要提这条提示。'
    const prev = config.injectDryRun
    config.injectDryRun = false
    void handleInjection('message', { messageType: 'private', userId: Number(owner), groupId: null, messageId: 'browse-' + Date.now(), text })
      .catch((e) => debugLog('[douyin-browse] failed: ' + e.message))
      .finally(() => { config.injectDryRun = prev })
    debugLog('[douyin-browse] nudged, next in ' + gapMin + ' min')
  }

  function resetStuckTurns() {
    const now = Date.now()
    for (const entry of sessions.values()) {
      if (entry.turnActive !== true) continue
      const age = now - (entry.turnStartedAt || 0)
      if (age < 8 * 60_000) continue
      const wasInjected = entry.currentTurnInjected === true
      entry.turnActive = false
      entry.currentTurnInjected = false
      entry.turnSuppressedReply = false
      debugLog('[stuck-guard] reset turn for ' + entry.key + ' age=' + Math.round(age / 1000) + 's injected=' + wasInjected)
      if (wasInjected) void flushDeferred(entry.key)
    }
  }

  function setActivity(name) {
    try {
      writeFileSync('C:\\Users\\Eyjafjalla\\qq-activity.json', JSON.stringify({ current: name, since: Date.now(), until: Date.now() + 10 * 60_000 }), 'utf8')
    } catch { /* ignore */ }
  }

  function maybeChooseActivity() {
    const file = join(memoryDir, '..', 'qq-activity-next.json')
    let st = { nextAt: 0 }
    try { st = JSON.parse(readFileSync(file, 'utf8')) } catch { st = { nextAt: 0 } }
    if (Date.now() < (st.nextAt || 0)) return
    // [activity-1c] 2–4 小时一次，且只在内部活动；不把自由时间的自言自语发到 QQ。
    const gap = nextActivityGapMinutes()
    st.nextAt = Date.now() + gap * 60_000
    try { writeFileSync(file, JSON.stringify(st), 'utf8') } catch { /* ignore */ }
    const owner = ownerQQ()
    if (!owner) return
    const text = '【系统】现在是你的自由时间。你可以从这些里选一个去做（也可以什么都不做）：\n' +
      'A. 刷抖音（先看 qq_contact_taste 里主人和朋友的喜好，再用 douyin_feed(query=关键词) 搜，别只看推荐流）\n' +
      'B. 看看空间（qq_qzone_list / qq_qzone_posts）\n' +
      'C. 找朋友聊两句（qq_send_to_user）\n' +
      'D. 发一条说说（qq_post_qzone）\n' +
      '选一个执行；只做这一件事，不要提这条提示，也不用向主人汇报。'
    const prev = config.injectDryRun
    config.injectDryRun = true
    void handleInjection('message', { messageType: 'private', userId: Number(owner), groupId: null, messageId: 'activity-' + Date.now(), text })
      .catch((e) => debugLog('[activity] inject failed: ' + e.message))
      .finally(() => { config.injectDryRun = prev })
    debugLog('[activity] nudged, next in ' + gap + ' min')
  }

  async function pollAnalyzeResults() {
    const ctx = {
      ownerQQ: () => ownerQQ(),
      inject: (frame) => handleInjection('message', frame),
      getDryRun: () => config.injectDryRun,
      setDryRun: (v) => { config.injectDryRun = v },
      debugLog,
    }
    const feature = features.get('pollAnalyzeResults')
    if (!feature) { debugLog('[feature] pollAnalyzeResults 未加载，功能已停用'); return }
    return feature(ctx)
  }

  function maybeDouyinSpark() {
    const file = join(memoryDir, '..', 'qq-douyin-spark.json')
    const today = new Date().toISOString().slice(0, 10)
    let st = /** @type {{ lastDate?: string }} */ ({})
    try { st = JSON.parse(readFileSync(file, 'utf8')) } catch { st = /** @type {{ lastDate?: string }} */ ({}) }
    if (st.lastDate === today) return
    if (new Date().getHours() < 14) return
    const owner = ownerQQ()
    if (!owner) return
    st.lastDate = today
    try { writeFileSync(file, JSON.stringify(st), 'utf8') } catch { }
    const text = '【系统】该续抖音火花了。用 douyin_send 给主人发一句话（自然点、别用模板），不要提这条提示。'
    const prev = config.injectDryRun
    config.injectDryRun = false
    void handleInjection('message', { messageType: 'private', userId: Number(owner), groupId: null, messageId: 'spark-' + Date.now(), text })
      .catch((e) => debugLog('[douyin-spark] failed: ' + e.message))
      .finally(() => { config.injectDryRun = prev })
    debugLog('[douyin-spark] nudged')
  }

  async function pollDouyinInbox() {
    return pollDouyinInboxService({
      inbox: 'D:\\DSH\\qqbot\\douyin\\dm-inbox.jsonl',
      configFile: 'D:\\DSH\\qqbot\\douyin\\config.json',
      offsetFile: join(memoryDir, '..', 'qq-douyin-offset.json'),
      ownerQQ: () => ownerQQ(),
      transcribe: (payload) => transcribe(payload),
      handleInjection: (kind, frame) => handleInjection(kind, frame),
      setReplyTarget: (target) => setInjectReplyTarget(target),
      config,
      debugLog,
    })
  }

  function maaNotifyTick() {
    return maaNotifyTickService({
      maaData: 'D:\\DSH\\qqbot\\maa\\data',
      server,
      ownerQQ: () => ownerQQ(),
      sendImageTo: (route, shot, caption) => sendImageTo(route, shot, caption),
      debugLog,
    })
  }

  return { maybeStartupGreet, maybeDouyinBrowse, maybeChooseActivity, setActivity, pollAnalyzeResults, maybeDouyinSpark, pollDouyinInbox, resetStuckTurns, maaNotifyTick }
}
