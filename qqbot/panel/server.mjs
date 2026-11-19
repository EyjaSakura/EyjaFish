// panel/server.mjs — 大肥鱼 控制台（本地 127.0.0.1:8899，零依赖）
// 左栏：运行状态 / 白名单；右栏：按 QQ 号的能力矩阵（写 data/perms.json 并热重载）
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { connect } from 'node:net'
import { pathToFileURL } from 'node:url'

const MEMORY_V2_FILE = 'D:/DSH/qqbot/data/memory/memory_store.mjs'
let __memv2 = null
async function memv2() {
  if (!__memv2) __memv2 = await import(pathToFileURL(MEMORY_V2_FILE).href)
  return __memv2
}

const PORT = 8899
const PROFILE = 'C:\\Users\\Eyjafjalla\\.dsh\\profiles\\web\\cordis.patch.yml'
const RUNTIME = 'C:\\Users\\Eyjafjalla\\qq-runtime.json'
const PERMS = 'D:\\DSH\\qqbot\\data\\perms.json'
const TASK = 'DSH-QQBot-Heartbeat'
const SHARED = 'C:\\Users\\Eyjafjalla\\subjects\\shared\\stickers'
const GREET_WHITELIST = 'D:\\DSH\\qqbot\\data\\startup-greet-whitelist.json'
const GREET_DEFAULT = {
  owner: { id: '1815442184', name: '主人', locked: true },
  friends: [{ id: '2930661826', name: '倩倩姐', enabled: true }],
  policy: {
    owner: { hourFrom: 8, hourTo: 24, maxPerDay: 1 },
    friend: { hourFrom: 9, hourTo: 22, maxPerDay: 1 },
  },
}
function readGreetWhitelist(text = '') {
  let data = null
  try { data = JSON.parse(readFileSync(GREET_WHITELIST, 'utf8').replace(/^\uFEFF/, '')) } catch { data = null }
  if (!data || typeof data !== 'object') data = JSON.parse(JSON.stringify(GREET_DEFAULT))
  const owner = getList(text, 'adminUsers')[0] || GREET_DEFAULT.owner.id
  data.owner = { id: String(owner), name: String(data.owner?.name || '主人'), locked: true }
  data.friends = Array.isArray(data.friends)
    ? data.friends.filter((f) => f && /^\d{5,12}$/.test(String(f.id))).map((f) => ({
        id: String(f.id),
        name: String(f.name || f.id),
        enabled: f.enabled !== false,
      }))
    : []
  data.policy = { ...JSON.parse(JSON.stringify(GREET_DEFAULT.policy)), ...(data.policy || {}) }
  return data
}
function writeGreetWhitelist(data) {
  mkdirSync('D:\\DSH\\qqbot\\data', { recursive: true })
  writeFileSync(GREET_WHITELIST, JSON.stringify(data, null, 2), 'utf8')
}

// 给某个号的会话目录建到共享素材的目录联接（一份文件、每个号可读可发）
function ensureJunction(user) {
  try {
    mkdirSync(SHARED, { recursive: true })
    const link = 'C:\\Users\\Eyjafjalla\\subjects\\u' + user + '\\stickers'
    if (!existsSync(link)) {
      execFileSync('cmd', ['/c', 'mklink', '/J', link, SHARED], { windowsHide: true })
    }
  } catch { /* 失败不影响其它功能 */ }
}
const CAPS = [
  ['image', '发图片', 'qq_send_image'],
  ['file', '发文件', 'qq_send_file'],
  ['voice', '发语音', 'qq_send_voice'],
  ['faces', '表情包', 'qq_face_*'],
  ['vision', '识图', '能看到你发的图'],
  ['fsRead', '读文件', 'read / glob / grep'],
  ['fsWrite', '写文件', 'write / edit'],
  ['shell', '执行命令', 'bash / pwsh'],
  ['profile', '改自己资料', '昵称 / 签名 / 头像'],
  ['qzone', '写QQ空间', '说说 · 日记'],
]

function readCfg() { return readFileSync(PROFILE, 'utf8') }
function backup() { const b = `${PROFILE}.bak-panel-${Date.now()}`; copyFileSync(PROFILE, b); return b }
function getScalar(text, key) { const m = text.match(new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm')); return m ? m[1].trim() : null }
function getList(text, key) {
  const raw = getScalar(text, key); if (!raw) return []
  return raw.replace(/^\[/, '').replace(/\]$/, '').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}
function setList(text, key, items) {
  const re = new RegExp(`^(\\s*)${key}:.*$`, 'm')
  if (!re.test(text)) throw new Error(`配置里没有 ${key}`)
  return text.replace(re, (_m, indent) => `${indent}${key}: [${items.join(', ')}]`)
}
function readPerms() {
  try { return JSON.parse(readFileSync(PERMS, 'utf8').replace(/^\\uFEFF/, '')) } catch { return {} }
}
function writePerms(obj) { writeFileSync(PERMS, JSON.stringify(obj, null, 2), 'utf8') }
function permsFor(id) {
  const all = readPerms(); const p = all[String(id)] || {}
  const out = {}; for (const [k] of CAPS) out[k] = p[k] !== false
  return out
}
function setPerm(id, key, value) {
  if (!CAPS.some(([k]) => k === key)) throw new Error('未知能力')
  const all = readPerms(); const p = all[String(id)] || {}
  p[key] = value === true; all[String(id)] = p
  writePerms(all)
}
function taskState() {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-ScheduledTask -TaskName '${TASK}' -ErrorAction Stop).State.ToString()`], { encoding: 'utf8' })
    return out.trim() || 'unknown'
  } catch { return 'missing' }
}
function botState() {
  try {
    const r = JSON.parse(readFileSync(RUNTIME, 'utf8'))
    return { updatedAt: r.updatedAt, sessions: r.sessionCount, version: r.version, uptime: r.uptimeSeconds }
  } catch { return null }
}
function portOpen(port, host = '127.0.0.1', timeout = 800) {
  return new Promise((resolve) => {
    const s = connect({ port, host }); const done = (v) => { s.destroy(); resolve(v) }
    s.setTimeout(timeout); s.once('connect', () => done(true)); s.once('timeout', () => done(false)); s.once('error', () => done(false))
  })
}
function triggerReload() {
  const t = readCfg()
  const cur = getScalar(t, 'ttsMaxChars') ?? '198'
  const next = cur === '198' ? '197' : '198'
  backup()
  writeFileSync(PROFILE, t.replace(new RegExp(`^(\\s*)ttsMaxChars:.*$`, 'm'), (_m, i) => `${i}ttsMaxChars: ${next}`), 'utf8')
}

// ---------- 人设卡 ----------
const PERSONAS = 'D:\\DSH\\qqbot\\personas'
const ACTIVE_MD = 'D:\\DSH\\qqbot\\persona\\default.md'
const ACTIVE_META = 'D:\\DSH\\qqbot\\persona\\.active.json'
const PERSONA_HISTORY = 'D:\\DSH\\qqbot\\persona\\.history'

function activePersona() {
  try {
    const m = JSON.parse(readFileSync(ACTIVE_META, 'utf8').replace(/^\uFEFF/, ''))
    return { name: m.name || '', appliedAt: m.appliedAt || '' }
  } catch { return { name: '', appliedAt: '' } }
}
function listPersonas() {
  try {
    return readdirSync(PERSONAS)
      .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
      .map((f) => {
        const full = `${PERSONAS}\\${f}`
        const text = readFileSync(full, 'utf8').replace(/^\uFEFF/, '')
        return {
          name: f.replace(/\.md$/, ''),
          title: (text.match(/^#\s+(.+)$/m)?.[1] ?? f).trim(),
          chars: text.length,
          preview: text.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 220),
        }
      })
  } catch { return [] }
}
function applyPersona(name) {
  if (!/^[\w\-]+$/.test(String(name ?? ''))) throw new Error('人设名不合法')
  const src = `${PERSONAS}\\${name}.md`
  if (!existsSync(src)) throw new Error('没有这张人设卡')
  mkdirSync(PERSONA_HISTORY, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  if (existsSync(ACTIVE_MD)) copyFileSync(ACTIVE_MD, `${PERSONA_HISTORY}\\default-${stamp}.md`)
  // 原子替换：写临时文件再 rename，避免插件读到半个文件
  const tmp = `${ACTIVE_MD}.tmp-${process.pid}`
  copyFileSync(src, tmp)
  renameSync(tmp, ACTIVE_MD)
  writeFileSync(ACTIVE_META, JSON.stringify({ name, appliedAt: new Date().toISOString() }, null, 2), 'utf8')
  return { name }
}


// ---------- 声线 ----------
const VOICE_DIR = 'D:\\DSH\\voice\\profiles'
const VOICE_ACTIVE = 'D:\\DSH\\qqbot\\persona\\.voice.json'

function listVoices() {
  try {
    return readdirSync(VOICE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const p = JSON.parse(readFileSync(`${VOICE_DIR}\\${f}`, 'utf8').replace(/^\uFEFF/, ''))
          return { id: p.id || f.replace(/\.json$/, ''), name: p.name || p.id || f, backend: p.backend || '' }
        } catch { return null }
      })
      .filter(Boolean)
  } catch { return [] }
}

function activeVoice() {
  try {
    const m = JSON.parse(readFileSync(VOICE_ACTIVE, 'utf8').replace(/^\uFEFF/, ''))
    return { id: m.id || '', appliedAt: m.appliedAt || '' }
  } catch { return { id: '', appliedAt: '' } }
}

function applyVoice(id) {
  if (!/^[\w\-]+$/.test(String(id ?? ''))) throw new Error('声线 id 不合法')
  const hit = listVoices().find((v) => v.id === id)
  if (!hit) throw new Error('没有这个声线')
  writeFileSync(VOICE_ACTIVE, JSON.stringify({ id, appliedAt: new Date().toISOString() }, null, 2), 'utf8')
  return { id }
}

const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>大肥鱼 · 控制台</title>
<style>
:root{--bg:#faf7f8;--card:#fff;--ink:#2a2226;--muted:#8b7f86;--line:#ece4e8;--pink:#e0526f;--ok:#2e9e63}
*{box-sizing:border-box}body{margin:0;font:15px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink)}
.wrap{max-width:1180px;margin:0 auto;padding:26px 22px 70px}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);font-size:13px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1.15fr;gap:18px;align-items:start}
@media(max-width:860px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 2px rgba(42,34,38,.04);transition:box-shadow .18s}
.card:hover{box-shadow:0 3px 12px rgba(42,34,38,.07)}
.card h2{font-size:13px;margin:0 0 12px;color:#6f626a;font-weight:600;letter-spacing:.03em}
.stat{display:flex;flex-wrap:wrap;gap:8px}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;background:#f0eaed;color:var(--muted)}
.pill.on{background:#e6f6ed;color:var(--ok)}.pill.off{background:#fbe9ee;color:var(--pink)}
.kv{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-top:1px solid var(--line)}
.kv:first-of-type{border-top:0}.kv span:first-child{color:var(--muted)}
.user{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px}
.user h3{margin:0 0 8px;font-size:14px;display:flex;justify-content:space-between;align-items:center}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}.row .hint{color:var(--muted);font-size:12px;margin-left:8px}
.sw{position:relative;width:42px;height:24px;flex:0 0 auto}.sw input{opacity:0;width:0;height:0}
.sl{position:absolute;inset:0;background:#d9d2d6;border-radius:24px;cursor:pointer;transition:.2s}
.sl:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}
.sw input:checked+.sl{background:var(--pink)}.sw input:checked+.sl:before{transform:translateX(18px)}
.tag{font-size:11px;padding:1px 8px;border-radius:999px;background:#f0eaed;color:var(--muted)}
.tag.admin{background:#fde8ef;color:var(--pink)}
input[type=text]{width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:9px;font:inherit}
input[type=text],select,input[type=number]{min-width:0}
button{border:0;border-radius:9px;padding:7px 12px;background:var(--pink);color:#fff;font:inherit;cursor:pointer;white-space:nowrap;flex:0 0 auto}
button:hover{filter:brightness(1.05)}
button.ghost{background:#f0eaed;color:var(--ink)}
.list{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.chip{background:#f0eaed;border-radius:999px;padding:3px 10px;font-size:13px}
.chip button{background:none;color:var(--muted);padding:0 0 0 6px;font-size:13px}
#log{white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;color:var(--muted);margin-top:8px;min-height:16px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.modal.on{display:flex}
.modal-box{background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden}
.modal-box header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);font-weight:600}
.modal-box pre{margin:0;padding:16px 18px;overflow:auto;white-space:pre-wrap;font:13px/1.7 ui-monospace,Consolas,monospace;color:var(--ink)}
</style>
<style>
/* [whale-bg] 视频背景 + 暗色全息皮 */
:root{--bg:#05070d;--card:rgba(8,16,30,.74);--ink:#e8f1ff;--muted:#8fa8cc;--line:#1e3a6b;--pink:#3a7bff;--ok:#39ffd1}
html,body{background:#05070d}
body{background:transparent!important}
#whaleBg{position:fixed;inset:0;z-index:0;overflow:hidden;background:#05070d}
#whaleBg video{width:100%;height:100%;object-fit:cover;display:block}
#whaleBg .scrim{position:absolute;inset:0;background:radial-gradient(ellipse 92% 82% at 50% 42%,rgba(5,7,13,.46) 0%,rgba(5,7,13,.76) 78%,rgba(5,7,13,.86) 100%)}
.wrap{position:relative;z-index:1}
h1{color:#eaf6ff}.sub{color:#8fa8cc}
.card{background:var(--card);border-color:var(--line);box-shadow:none}
.card h2{color:#9fd0ff}
.user,.modal-box{border-color:var(--line)}
.pill{background:rgba(20,40,71,.7);color:var(--muted)}
.pill.on{background:rgba(57,255,209,.14);color:#39ffd1}
.pill.off{background:rgba(224,82,111,.16);color:#ff8fa3}
.sw .sl{background:#1b3355}
input[type=text],select,input[type=number],textarea{background:rgba(8,20,36,.88)!important;color:#e8f1ff!important;border-color:var(--line)!important}
button{background:#3a7bff;color:#fff}
button.ghost{background:rgba(20,40,71,.75);color:#cfe4f6}
.chip{background:rgba(20,40,71,.75);color:#cfe4f6}
.tag{background:rgba(20,40,71,.75);color:var(--muted)}
.tag.admin{background:rgba(58,123,255,.2);color:#9fd0ff}
.modal{background:rgba(3,6,12,.72)}
.modal-box{background:rgba(8,16,30,.92)}
.modal-box header{border-color:var(--line)}
#log{color:#8fb0cc}
</style></head><body>
<div id="whaleBg" aria-hidden="true"><video autoplay muted loop playsinline preload="auto"><source src="/assets/whale-bg.webm" type="video/webm"><source src="/assets/whale-bg.mp4" type="video/mp4"></video><div class="scrim"></div></div>
<div class="wrap">
<h1>大肥鱼 · 控制台</h1>
<div class="sub">左栏看她现在怎么样，右栏按号开关她的能力。改动写盘后热重载，约 2–5 秒生效；权限在<b>每次工具调用时实时校验</b>，不需要 /new。</div>
<div class="grid">
  <div>
    <div class="card"><h2>运行状态</h2><div id="status" class="stat">读取中…</div><div id="kv"></div></div>
    <div class="card"><h2>私聊白名单</h2><div id="users" class="list"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><input type="text" id="newUser" placeholder="QQ 号"><button onclick="addUser()">添加</button></div></div>
    <div class="card"><h2>启动问候白名单</h2>
      <div id="greetOwner" class="list"></div>
      <div id="greetFriends" class="list"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><input type="text" id="newGreetFriend" placeholder="朋友 QQ 号"><button onclick="addGreetFriend()">添加朋友</button></div>
      <div class="sub" style="margin:8px 0 0">主人锁定；朋友可增删。朋友只在 09:00–22:00 问候，每天最多一次，不引用记忆、关系或主人。</div>
    </div>
    <div class="card"><h2>群聊白名单</h2><div id="groups" class="list"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><input type="text" id="newGroup" placeholder="群号"><button onclick="addGroup()">添加</button></div>
      <div class="sub" style="margin:8px 0 0">空 = 拒绝所有群消息</div></div>
    <div class="card"><h2>对话节奏</h2>
      <div class="sub" style="margin:0 0 10px">限流：超出的回复会被丢弃（她表现为突然不理人）。调太大有 QQ 风控风险。</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label class="sub" style="flex:1 1 auto">每 <input id="rateWindow" type="number" min="10" max="600" step="10" style="width:70px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;font:inherit"> 秒内最多回</label>
        <input id="rateMax" type="number" min="1" max="60" step="1" style="width:70px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;font:inherit">
        <span class="sub">条</span>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="saveRate()">保存</button>
      </div>
      <div class="sub" id="rateNow" style="margin:8px 0 0">当前：读取中…</div>
    </div>
    <div class="card"><h2>主动消息 / 维护</h2>
      <div class="row"><div><b>主动找你（心跳）</b><span class="hint">计划任务</span></div>
        <label class="sw"><input type="checkbox" id="taskSw"><span class="sl"></span></label></div>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <button class="ghost" onclick="resetSessions()">重装会话（刷新工具）</button><button class="ghost" onclick="reloadPlugin()">强制重载插件</button>
        <button class="ghost" onclick="load()">刷新</button></div>
      <div id="log"></div></div>
  </div>
  <div>
    <div class="card"><h2>按号权限</h2>
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
    <select id="userSel" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;background:#fff"></select>
    <span id="userRole" class="tag"></span>
  </div>
  <div class="sub" style="margin:0 0 6px">选择账号后，下面只显示这个号的开关。</div>
  <div id="matrix">读取中…</div>
</div>
    <div class="card"><h2>人设卡</h2>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
        <span id="personaActive" style="font-size:14px">当前：读取中…</span>
        <span style="display:flex;gap:8px">
          <button class="ghost" onclick="window.open('/selfcheck','_blank')">自检记</button>
          <button class="ghost" onclick="openPersonaDir()">打开目录</button></span>
      </div>
      <select id="personaSel" style="width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;background:#fff"></select>
      <div class="sub" style="margin:12px 0 4px">预览：</div>
      <div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;color:var(--muted);height:120px;overflow:auto;line-height:1.7" id="personaPreview">—</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button class="ghost" onclick="previewFull()">预览全文</button>
        <button onclick="applyPersonaUI()">应用这张</button>
      </div>
      <div class="sub" style="margin:8px 0 0">卡库：<code>D:\DSH\qqbot\personas</code> · 切换后下一句消息生效，不影响记忆</div>
    </div>
    <div class="card"><h2>声线</h2>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
        <span id="voiceActive" style="font-size:14px">当前：读取中…</span>
        <button class="ghost" onclick="openVoiceDir()">打开目录</button>
      </div>
      <select id="voiceSel" style="width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;background:#fff"></select>
      <div class="sub" style="margin:8px 0 0" id="voiceHint">选一个声线，点「应用」后下一条语音生效（不用重启服务）</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="applyVoiceUI()">应用声线</button>
      </div>
      <div class="sub" style="margin:8px 0 0">声线库：<code>D:\DSH\voice\profiles</code> · 当前记录：<code>D:\DSH\qqbot\persona\.voice.json</code></div>
    </div>
  </div>
</div>
<div class="modal" id="personaModal" onclick="if(event.target===this)closeModal()">
  <div class="modal-box">
    <header><span id="modalTitle">预览</span><button class="ghost" onclick="closeModal()">关闭</button></header>
    <pre id="modalBody"></pre>
  </div>
</div><script>
const log = (m) => { document.getElementById('log').textContent = new Date().toLocaleTimeString() + '  ' + m }
async function api(p, b) {
  const r = await fetch(p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {})
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}
const CAPS = ${JSON.stringify(CAPS)}
let USERS = []
let SELECTED = localStorage.getItem('panel.selectedUser') || ''
function renderMatrix() {
  const sel = document.getElementById('userSel')
  const box = document.getElementById('matrix')
  const role = document.getElementById('userRole')
  box.innerHTML = ''
  const u = USERS.find((x) => x.id === sel.value) || USERS[0]
  if (!u) { box.innerHTML = '<span class="pill">白名单为空</span>'; role.textContent = ''; return }
  role.textContent = u.admin ? 'admin' : 'guest'
  role.className = 'tag ' + (u.admin ? 'admin' : '')
  role.title = u.admin ? '基础权限包：媒体/文件工具可用' : '只读：媒体与文件工具都不可用'

  const head = document.createElement('div'); head.className = 'row'
  head.innerHTML = '<div><b>基础权限包</b><span class="hint">admin = 拥有媒体/文件/命令工具；关掉即 guest 只读</span></div>'
  const adm = document.createElement('label'); adm.className = 'sw'
  adm.innerHTML = '<input type="checkbox" ' + (u.admin ? 'checked' : '') + '><span class="sl"></span>'
  adm.querySelector('input').addEventListener('change', async (e) => {
    try { await api('/api/admin', { user: u.id, enabled: e.target.checked }); log('admin ' + u.id + ' = ' + e.target.checked); load() }
    catch (err) { log('失败：' + err.message); e.target.checked = !e.target.checked }
  })
  head.appendChild(adm); box.appendChild(head)

  CAPS.forEach(([key, label, hint]) => {
    const row = document.createElement('div'); row.className = 'row'
    row.innerHTML = '<div><b>' + label + '</b><span class="hint">' + hint + '</span></div>'
    const sw = document.createElement('label'); sw.className = 'sw'
    sw.innerHTML = '<input type="checkbox" ' + (u.perms[key] ? 'checked' : '') + '><span class="sl"></span>'
    sw.querySelector('input').addEventListener('change', async (e) => {
      try { await api('/api/perm', { user: u.id, key, value: e.target.checked }); log(u.id + ' ' + label + ' = ' + e.target.checked) }
      catch (err) { log('失败：' + err.message); e.target.checked = !e.target.checked }
    })
    row.appendChild(sw); box.appendChild(row)
  })
}
function renderStartupGreet(g) {
  const ownerEl = document.getElementById('greetOwner')
  const friendsEl = document.getElementById('greetFriends')
  if (!ownerEl || !friendsEl) return
  ownerEl.innerHTML = ''
  const own = document.createElement('span'); own.className = 'chip'
  own.textContent = (g.owner?.name || '主人') + '（' + (g.owner?.id || '') + '，锁定）'
  ownerEl.appendChild(own)
  friendsEl.innerHTML = ''
  const friends = Array.isArray(g.friends) ? g.friends : []
  if (!friends.length) { friendsEl.innerHTML = '<span class="pill">暂无朋友</span>'; return }
  for (const f of friends) {
    const chip = document.createElement('span'); chip.className = 'chip'
    chip.textContent = (f.name || f.id) + '（' + f.id + '）'
    const b = document.createElement('button'); b.textContent = '×'
    b.onclick = async () => {
      try { await api('/api/startup-greet', { action: 'remove', id: f.id }); log('已移除启动问候：' + f.id); load() }
      catch (e) { log('移除失败：' + e.message) }
    }
    chip.appendChild(b); friendsEl.appendChild(chip)
  }
}
async function addGreetFriend() {
  const input = document.getElementById('newGreetFriend')
  const id = (input.value || '').trim()
  if (!/^\d{5,12}$/.test(id)) { log('QQ 号不合法'); return }
  try { await api('/api/startup-greet', { action: 'add', id, name: id }); input.value = ''; log('已加入启动问候：' + id); load() }
  catch (e) { log('添加失败：' + e.message) }
}
function chips(el, items, onRemove) {
  el.innerHTML = ''
  if (!items.length) { el.innerHTML = '<span class="pill">空</span>'; return }
  items.forEach((it) => {
    const s = document.createElement('span'); s.className = 'chip'; s.textContent = it
    const b = document.createElement('button'); b.textContent = '×'; b.onclick = () => onRemove(it)
    s.appendChild(b); el.appendChild(s)
  })
}
let PERSONAS = []
function renderPersonas(s) {
  PERSONAS = s.personas || []
  const sel = document.getElementById('personaSel')
  sel.innerHTML = ''
  PERSONAS.forEach((p) => {
    const o = document.createElement('option'); o.value = p.name
    o.textContent = p.title + '（' + p.chars + ' 字）'
    sel.appendChild(o)
  })
  if (s.active && s.active.name) sel.value = s.active.name
  showPersonaInfo(s)
}
function showPersonaInfo(s) {
  const name = document.getElementById('personaSel').value
  const p = PERSONAS.find((x) => x.name === name)
  const activeName = s && s.active ? s.active.name : ''
  const when = s && s.active && s.active.appliedAt ? new Date(s.active.appliedAt).toLocaleString() : ''
  const activeP = PERSONAS.find((x) => x.name === activeName)
  document.getElementById('personaActive').textContent = '当前：' + (activeP ? activeP.title : (activeName || '未知')) + (when ? ' · 切换于 ' + when : '')
  document.getElementById('personaPreview').textContent = p ? p.preview : '—'
  document.getElementById('personaActive').title = name === activeName ? '这就是当前生效的卡' : '点「应用」后切换为：' + name
}
async function openPersonaDir() {
  try { await api('/api/open-folder', {}); log('已在资源管理器打开卡库目录') }
  catch (e) { log('打开失败：' + e.message) }
}
async function previewFull() {
  const name = document.getElementById('personaSel').value
  if (!name) { log('没有选中的卡'); return }
  try {
    const r = await fetch('/api/persona/text?name=' + encodeURIComponent(name))
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
    document.getElementById('modalTitle').textContent = (j.title || name) + ' · ' + (j.text ? j.text.length : 0) + ' 字'
    document.getElementById('modalBody').textContent = j.text || ''
    document.getElementById('personaModal').classList.add('on')
  } catch (e) { log('读取失败：' + e.message) }
}
function closeModal() { document.getElementById('personaModal').classList.remove('on') }

function renderVoices(s) {
  const sel = document.getElementById('voiceSel')
  if (!sel) return
  const list = (s && s.voices) || []
  sel.innerHTML = ''
  list.forEach((v) => {
    const o = document.createElement('option')
    o.value = v.id
    o.textContent = v.name + '（' + v.backend + '）'
    sel.appendChild(o)
  })
  const av = (s && s.voice) || {}
  if (av.id && list.some((v) => v.id === av.id)) sel.value = av.id
  const cur = list.find((v) => v.id === av.id)
  const when = av.appliedAt ? ' · 切换于 ' + new Date(av.appliedAt).toLocaleString() : ''
  const el = document.getElementById('voiceActive')
  if (el) el.textContent = '当前：' + (cur ? cur.name : (av.id || '未设置')) + when
}
async function applyVoiceUI() {
  const id = document.getElementById('voiceSel').value
  if (!id) return
  try { await api('/api/voice', { id }); log('已切换声线：' + id + '（下一条语音生效）'); load() }
  catch (e) { log('切换声线失败：' + e.message) }
}
async function openVoiceDir() {
  try { await api('/api/open-voice-dir', {}); log('已打开声线目录') } catch (e) { log('打开失败：' + e.message) }
}
function renderRate(s) {
  const r = (s && s.rateLimit) || {}
  const max = Number(r.max) || 20
  const win = Number(r.window) || 60
  document.getElementById('rateMax').value = max
  document.getElementById('rateWindow').value = win
  const eff = r.effective
  document.getElementById('rateNow').textContent = '当前配置：每 ' + win + ' 秒最多回 ' + max + ' 条'
    + (eff ? '　|　插件已生效：每 ' + eff.rateLimitWindowSeconds + ' 秒 ' + eff.rateLimitMaxReplies + ' 条（' + new Date(eff.at).toLocaleTimeString() + '）' : '　|　插件尚未上报')
  document.getElementById('rateNow').textContent = '当前配置：每 ' + win + ' 秒最多回 ' + max + ' 条'
    + (eff ? '　|　插件已生效：每 ' + eff.rateLimitWindowSeconds + ' 秒 ' + eff.rateLimitMaxReplies + ' 条' : '　|　插件尚未上报')
}
async function saveRate() {
  const max = Number(document.getElementById('rateMax').value)
  const win = Number(document.getElementById('rateWindow').value)
  if (!Number.isFinite(max) || max < 1 || max > 60) { log('条数需要在 1~60'); return }
  if (!Number.isFinite(win) || win < 10 || win > 600) { log('窗口需要在 10~600 秒'); return }
  try { await api('/api/rate', { max, window: win }); log('已保存：每 ' + win + ' 秒最多回 ' + max + ' 条（插件重载中）'); setTimeout(load, 4000) }
  catch (e) { log('保存失败：' + e.message) }
}
async function applyPersonaUI() {
  const name = document.getElementById('personaSel').value
  if (!name) return
  try { await api('/api/persona', { name }); log('已切换人设：' + name + '（下一句生效）'); load() }
  catch (e) { log('切换失败：' + e.message) }
}
async function load() {
  try {
    const s = await api('/api/state')
    window.__lastState = s
    const r = s.runtime || {}
    document.getElementById('status').innerHTML =
      '<span class="pill ' + (s.botOnline ? 'on' : 'off') + '">' + (s.botOnline ? 'QQ 在线' : 'QQ 离线') + '</span>' +
      '<span class="pill ' + (s.port6700 ? 'on' : 'off') + '">插件 ' + (s.port6700 ? '已监听' : '未监听') + '</span>' +
      '<span class="pill">会话 ' + (r.sessions ?? 0) + '</span>' +
      '<span class="pill ' + (s.taskEnabled ? 'on' : 'off') + '">心跳 ' + s.taskState + '</span>'
    const up = r.uptime ? Math.round(r.uptime / 3600) + ' 小时' : '—'
    document.getElementById('kv').innerHTML =
      '<div class="kv"><span>插件版本</span><span>' + (r.version || '—') + '</span></div>' +
      '<div class="kv"><span>已运行</span><span>' + up + '</span></div>' +
      '<div class="kv"><span>最近心跳</span><span>' + (s.lastHeartbeat || '无记录') + '</span></div>'
          + '<div class="kv"><span>她在干什么</span><span>' + (() => { if (!s.activity) return '空闲'; const m = Math.round((Date.now() - s.activity.since) / 60000); const over = s.activity.until ? Date.now() > s.activity.until : m > 15; return over ? '空闲（上次 ' + s.activity.current + '）' : s.activity.current + '（' + m + ' 分钟）' })() + '</span></div>' // [activity-expire]
          + '<div class="kv"><span>抖音</span><span>' + (s.douyinMin === null ? '未知' : (s.douyinMin <= 3 ? '在线' : '静默 ' + s.douyinMin + ' 分钟')) + '</span></div>'
          + '<div class="kv"><span>队列</span><span>出站 ' + (s.queue || 0) + ' · 排队 ' + (s.deferred || 0) + '</span></div>'
    chips(document.getElementById('users'), s.allowUsers, async (v) => { try { await api('/api/whitelist', { kind: 'users', remove: v }); load() } catch (e) { log(e.message) } })
    chips(document.getElementById('groups'), s.allowGroups, async (v) => { try { await api('/api/whitelist', { kind: 'groups', remove: v }); load() } catch (e) { log(e.message) } })
    document.getElementById('taskSw').checked = s.taskEnabled
    renderPersonas(s)
    renderVoices(s)
    renderRate(s)
    renderStartupGreet(s.startupGreet || {})

    // 下拉选号：保留当前选择，白名单变化时自动补/删
    USERS = s.users || []
    const sel = document.getElementById('userSel')
    const keep = USERS.some((u) => u.id === SELECTED) ? SELECTED : (USERS[0]?.id || '')
    SELECTED = keep
    sel.innerHTML = ''
    USERS.forEach((u) => {
      const o = document.createElement('option'); o.value = u.id
      o.textContent = u.id + (u.admin ? '  ·  admin' : '  ·  guest')
      sel.appendChild(o)
    })
    if (keep) sel.value = keep
    renderMatrix()
  } catch (e) { log('读取失败：' + e.message) }
}
document.getElementById('userSel').addEventListener('change', (e) => {
  SELECTED = e.target.value
  localStorage.setItem('panel.selectedUser', SELECTED)
  renderMatrix()
})
document.getElementById('personaSel').addEventListener('change', () => showPersonaInfo(window.__lastState))
document.getElementById('taskSw').addEventListener('change', async (e) => {
  try { await api('/api/task', { enabled: e.target.checked }); log('心跳 ' + (e.target.checked ? '启用' : '停用')) }
  catch (err) { log('失败：' + err.message); e.target.checked = !e.target.checked }
})
async function addUser() {
  const v = document.getElementById('newUser').value.trim(); if (!v) return
  try { await api('/api/whitelist', { kind: 'users', add: v }); document.getElementById('newUser').value = ''; load() } catch (e) { log(e.message) }
}
async function addGroup() {
  const v = document.getElementById('newGroup').value.trim(); if (!v) return
  try { await api('/api/whitelist', { kind: 'groups', add: v }); document.getElementById('newGroup').value = ''; load() } catch (e) { log(e.message) }
}
async function reloadPlugin() { try { await api('/api/reload'); log('已触发重载') } catch (e) { log(e.message) } }
async function resetSessions() {
  if (!confirm('会清空各号的会话映射（记忆文件保留），下次消息重开新会话。继续？')) return
  try { await api('/api/reset-sessions', {}); log('会话已重置，发一条消息让工具重新注册') } catch (e) { log('重置失败：' + e.message) }
}
load(); setInterval(load, 15000)
</script></body></html>`

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const send = (code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
  try {
    // [whale-bg] 皮肤循环视频（mp4 + webm 兜底），支持 Range 以便浏览器拖动/循环
    if (req.method === 'GET' && (url.pathname === '/assets/whale-bg.mp4' || url.pathname === '/assets/whale-bg.webm')) {
      const isWebm = url.pathname.endsWith('.webm')
      const file = isWebm
        ? 'D:\\DSH\\qqbot\\panel\\assets\\whale-bg.webm'
        : 'D:\\DSH\\qqbot\\panel\\assets\\whale-bg.mp4'
      const mime = isWebm ? 'video/webm' : 'video/mp4'
      try {
        const size = statSync(file).size
        const range = req.headers.range
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range)
          const start = m && m[1] ? Number(m[1]) : 0
          const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
          if (start >= size || start > end) {
            res.writeHead(416, { 'content-range': 'bytes */' + size })
            res.end()
            return
          }
          res.writeHead(206, {
            'content-type': mime,
            'accept-ranges': 'bytes',
            'content-range': 'bytes ' + start + '-' + end + '/' + size,
            'content-length': end - start + 1,
            'cache-control': 'no-store',
          })
          createReadStream(file, { start, end }).pipe(res)
          return
        }
        res.writeHead(200, { 'content-type': mime, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' })
        createReadStream(file).pipe(res)
      } catch (e) {
        send(404, { ok: false, error: '背景视频缺失：' + e.message })
      }
      return
    }
    if (req.method === 'GET' && url.pathname === '/') return send(200, page, 'text/html; charset=utf-8')

  // ===== [memory-v2] 稳定 id / 真记忆库 / 体检 / 联动 =====
  const SHARED_MEMORY_FILE = 'D:\\DSH\\qqbot\\data\\shared-memory.json'
  const RECALL_FILE = 'D:\\DSH\\qqbot\\data\\memory-recall.json'
  const FACT_ID_RE = /^m[0-9a-f]{12}(-\d+)?$/

  // 归一化规则写死：NFKC 全角转半角 → 小写 → 去所有标点与空白 → sha1 前 12 位 → id = 'm' + hash。
  // ⚠ 桥补丁 patches/memory-recall.mjs 里有一份逐字相同的实现，改这里必须同步那边，反之亦然。
  function normalizeFactText(s) {
    return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  }
  function hashText(s) { return createHash('sha1').update(normalizeFactText(s), 'utf8').digest('hex').slice(0, 12) }
  function factIdOf(s) { return 'm' + hashText(s) }

  // 原子写会先写 tmp 再 rename，中间那一瞬可能读到 ENOENT，所以失败等 100ms 再试一次
  function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { } }
  function emptyStore() { return { facts: [], updatedAt: 0 } }
  function readSharedStore() {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!existsSync(SHARED_MEMORY_FILE)) return emptyStore()
        const raw = readFileSync(SHARED_MEMORY_FILE, 'utf8').replace(/^\uFEFF/, '')
        const data = JSON.parse(raw)
        return { facts: Array.isArray(data && data.facts) ? data.facts : [], updatedAt: Number(data && data.updatedAt) || 0 }
      } catch (e) {
        if (attempt === 0) { sleepSync(100); continue }
        console.warn('[shared-memory] read failed: ' + (e && e.message))
        return emptyStore()
      }
    }
    return emptyStore()
  }
  // 原子写：tmp 再 rename；4 空格缩进；中文不转义
  function writeSharedStore(store) {
    const tmp = SHARED_MEMORY_FILE + '.tmp'
    mkdirSync('D:\\DSH\\qqbot\\data', { recursive: true })
    writeFileSync(tmp, JSON.stringify({ facts: store.facts, updatedAt: Date.now() }, null, 4), 'utf8')
    renameSync(tmp, SHARED_MEMORY_FILE)
  }

  // 读回事实并补默认字段；同一归一化文本只留 createdAt 最早的一条；id 撞了但文本不同 → 加 -1、-2
  function loadFacts() {
    const store = readSharedStore()
    const byBase = new Map(); const out = []
    for (const raw of store.facts) {
      if (!raw || typeof raw !== 'object') continue
      const text = String(raw.text || '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      const base = factIdOf(text)
      const prev = byBase.get(base)
      if (prev) {
        if (normalizeFactText(prev.text) === normalizeFactText(text)) {
          if (raw.createdAt && (!prev.createdAt || Number(raw.createdAt) < prev.createdAt)) { prev.text = text; prev.createdAt = Number(raw.createdAt) || prev.createdAt }
          if (raw.status === 'rejected') prev.status = 'rejected'
          else if (raw.status === 'active') prev.status = 'active'
          if (raw.confirmedAt && !prev.confirmedAt) prev.confirmedAt = Number(raw.confirmedAt) || 0
          continue
        }
        let k = 1, id = base + '-' + k
        while (byBase.has(id)) { k++; id = base + '-' + k }
        console.warn('[memory] id 撞了但文本不同：' + base + ' -> ' + id)
        byBase.set(id, { raw, id })
        out.push({ raw, id })
        continue
      }
      byBase.set(base, { raw, id: base })
      out.push({ raw, id: base })
    }
    return out.filter(x => x.id).map(({ raw, id }) => ({
      raw,
      id,
      text: String(raw.text || '').replace(/\s+/g, ' ').trim(),
      status: raw.status === 'pending' || raw.status === 'rejected' ? raw.status : 'active',
      src: String(raw.src || '手写'),
      createdAt: Number(raw.createdAt) || Number(raw.at) || 0,
      confirmedAt: Number(raw.confirmedAt) || 0,
      note: String(raw.note || ''),
      test: raw.test === true,
    }))
  }

  function fmtTime(ms) {
    const d = new Date(Number(ms) || 0)
    if (!Number.isFinite(d.getTime()) || d.getTime() <= 0) return ''
    const p = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  }

  const GRAM = (t) => { const s = new Set(); const x = String(t).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ''); for (let i = 0; i < x.length - 1; i++) s.add(x.slice(i, i + 2)); return s }
  function jaccard(a, b) {
    if (!a || !b || !a.size || !b.size) return 0
    let inter = 0; for (const g of a) if (b.has(g)) inter++
    return inter / (a.size + b.size - inter)
  }

  // 两个阈值是两套用途，各有各的道理，别顺手统一：
  //   连边 0.35 —— 求稳。事实之间只要用词有点像就拉线，星图会糊成一团，所以宁可少连。
  //   冲突 0.30 —— 宁漏不误报。冲突要抓得到，但假冲突比漏报更烦人，所以再低也不再放宽。
  const FACT_FACT_EDGE_MIN = 0.35
  const CONFLICT_MIN = 0.30
  const STALE_DAYS = 90
  const DAY_MS = 86400000
  const OPPOSITES = [['男', '女'], ['喜欢', '讨厌'], ['能', '不能'], ['在', '不在'], ['是', '不是']]
  const SUBJECTS = ['倩倩姐', '珊姐姐', '主人', '我', '你']
  const NEG_PREFIX = /不(在|能|是)/g

  // 否定式里的字不算单独命中：「不在」里的「在」不当作肯定，「是不是」两边都不算
  function hasWord(text, w) {
    if (!text.includes(w)) return false
    if (w === '在' || w === '能' || w === '是') return text.replace(NEG_PREFIX, '\u0000').includes(w)
    return true
  }
  function hitOpposite(a, b) {
    for (const [x, y] of OPPOSITES) {
      const aX = hasWord(a, x), aY = hasWord(a, y), bX = hasWord(b, x), bY = hasWord(b, y)
      if ((aX && !aY && bY && !bX) || (aY && !aX && bX && !bY)) return [x, y]
    }
    return null
  }
  function sharedSubject(a, b) { for (const s of SUBJECTS) { if (a.includes(s) && b.includes(s)) return s } return null }

  // 从文本里抠日期；解析失败返回 null，一律跳过不标
  function parseDay(text) {
    const mk = (y, mo, d) => {
      const dt = new Date(y, mo - 1, d)
      if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
      return dt.getTime()
    }
    const now = new Date()
    let m = text.match(/(20\d{2})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/)
    if (m) return mk(+m[1], +m[2], +m[3])
    m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/)
    if (m) { const t = mk(now.getFullYear(), +m[1], +m[2]); if (t === null) return null; return t > Date.now() ? mk(now.getFullYear() - 1, +m[1], +m[2]) : t }
    m = text.match(/(?:^|[^\d])(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/)
    if (m) { const t = mk(now.getFullYear(), +m[1], +m[2]); if (t === null) return null; return t > Date.now() ? mk(now.getFullYear() - 1, +m[1], +m[2]) : t }
    return null
  }
  const EXPIRED_HINT = /约定|答应|截止|之前|提醒|前/

  // [memory-map] 记忆星图数据
  function buildMemory() {
    const nodes = []; const seen = new Set();
    const usedIds = new Set();
    const pushNode = (o) => {
      let id = o.id
      if (usedIds.has(id)) { let k = 1; while (usedIds.has(id + '-' + k)) k++; id = id + '-' + k }
      usedIds.add(id)
      const node = { ...o, id }
      nodes.push(node)
      return node
    }
    // 对话节点：hash 用「文本 + 来源 + 时间」，同一句换个来源不会被误并
    const add = (text, role, src, time, kind) => {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      const maxLen = src === '自检记' ? 1200 : 400;
      if (t.length < 4 || t.length > maxLen) return;
      const key = normalizeFactText(t).slice(0, 80) || t.slice(0, 80);
      if (seen.has(key)) return; seen.add(key);
      const WHO = { '主人': '主人', '倩倩姐': '倩倩姐', '珊姐姐': '珊姐姐', '人格卡': '小鲸鱼', '自检记': '小鲸鱼' };
      pushNode({ id: 'm' + hashText(t + '|' + src + '|' + (time || '')), text: t, title: t.slice(0, 22), role, src, who: WHO[src] || '', time: time || '', kind });
    };
    try { // [memory-core-sections] 每个二级章节最多两条：首句 + 一条关键规则
      const md = readFileSync('D:\\DSH\\qqbot\\personas\\xiaojingyu.md', 'utf8');
      const lines = md.split(/\r?\n/);
      const clean = (x) => x.replace(/^[-*>]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      const okLine = (x) => x.length >= 8 && x.length <= 120 && !x.startsWith('```');
      let cur = '', buf = [], n = 0;
      const KEY = /不要|必须|永远|别|铁律|绝不|不能/;
      const flush = () => {
        if (!cur || n >= 50) { buf = []; return }
        const body = buf.map(clean).filter(okLine);
        const first = body[0];
        const key = body.slice(1).find((x) => KEY.test(x));
        if (first) { add(cur + '：' + first.slice(0, 80), 'persona', '人格卡', '', 'core'); n++ }
        if (key && n < 50) { add(cur + '：' + key.slice(0, 80), 'persona', '人格卡', '', 'core'); n++ }
        buf = [];
      };
      for (const line of lines) {
        const h = /^##\s+(.+)$/.exec(line.trim());
        if (h) { flush(); cur = h[1].trim(); continue }
        if (/^#\s+/.test(line.trim())) continue;
        if (cur) buf.push(line);
      }
      flush();
    } catch { }
    for (const uid of ['1815442184', '2930661826', '3355373151']) {
      try {
        const j = JSON.parse(readFileSync('C:\\Users\\Eyjafjalla\\qq-memory\\u_' + uid + '.json', 'utf8'));
        const hist = Array.isArray(j.history) ? j.history : [];
        for (const m of hist.slice(-500)) {
          const text = String(m.text || '');
          let kind = 'raw';
          if (/记住|承诺|答应|别忘|生日|名字|重要/.test(text)) kind = 'special';
          else if (text.length > 60) kind = 'important';
          const nameOf = { '1815442184': '主人', '2930661826': '倩倩姐', '3355373151': '珊姐姐' }[uid] || uid;
        add(text, m.role || 'user', nameOf, m.at ? new Date(m.at).toISOString().slice(0, 16).replace('T', ' ') : '', kind);
        }
      } catch { }
    }
    try { // [memory-core-cap] 她的自检记也算特殊记忆
      const d = readFileSync('D:\\DSH\\qqbot\\小鲸鱼自检记.txt', 'utf8');
      for (const line of d.split(/\r?\n/)) {
        if (!/^\[?\d{4}-\d{2}-\d{2}/.test(line)) continue;
        add(line.trim(), 'diary', '自检记', line.slice(0, 16), 'special');
      }
    } catch { }

    // 真记忆库：active → fact，pending → 待确认暗星，rejected 不上星图
    // [memory-v2] USE_V2 开关：存在即用新事实层，否则沿用旧 shared-memory.json
    const MEM_V2_DIR = 'D:\\DSH\\qqbot\\data\\memory'
    const MEM_V2_FLAG = MEM_V2_DIR + '\\USE_V2'
    let allFacts
    if (existsSync(MEM_V2_FLAG)) {
      try {
        const j = JSON.parse(readFileSync(MEM_V2_DIR + '\\facts.json', 'utf8').replace(/^\uFEFF/, ''))
        const includeSuperseded = url.searchParams.get('include') === 'superseded'
        const evWho = new Map()
        try {
          for (const line of readFileSync('D:\\DSH\\qqbot\\data\\memory\\events.jsonl', 'utf8').split('\n')) {
            if (!line.trim()) continue
            const e = JSON.parse(line)
            evWho.set(e.id, e.who)
          }
        } catch { }
        allFacts = (Array.isArray(j && j.facts) ? j.facts : [])
          .filter(f => f && (includeSuperseded || f.status !== 'superseded'))
          .map(f => {
            const w = String(evWho.get(f.source) || '')
            const who = /3355373151/.test(w) ? '珊姐姐' : /2930661826/.test(w) ? '倩倩姐' : /1815442184/.test(w) ? '主人' : w
            return { id: f.id, text: String(f.claim || ''), status: f.status, src: 'v2', who, createdAt: Number(f.since) || 0, confirmedAt: Number(f.recorded_at) || 0, subject: f.subject }
          })
      } catch (e) {
        console.warn('[memory-v2] facts read failed: ' + e.message)
        allFacts = loadFacts()
      }
    } else {
      allFacts = loadFacts()
    }
    const factNodes = []
    for (const f of allFacts) {
      if (f.status === 'rejected') continue
      const kind = f.status === 'pending' ? 'pending' : (f.status === 'superseded' ? 'superseded' : 'fact')
      const node = pushNode({ id: f.id, text: f.text, title: f.text.slice(0, 22), role: f.status, src: f.src, who: f.who || '', time: fmtTime(f.createdAt), kind })
      factNodes.push({ ...f, node })
    }
    const pendingNodes = factNodes.filter(x => x.status === 'pending')

    // —— 体检：只在 active fact 之间算，pending/对话节点不参与 ——
    const activeFacts = factNodes.filter(x => x.status === 'active')
    const factGrams = new Map(activeFacts.map(x => [x.node.id, GRAM(x.text)]))
    const conflicts = []
    const pairs = []
    for (let i = 0; i < activeFacts.length; i++) {
      for (let j = i + 1; j < activeFacts.length; j++) {
        const w = jaccard(factGrams.get(activeFacts[i].node.id), factGrams.get(activeFacts[j].node.id))
        pairs.push([i, j, w])
        if (w > CONFLICT_MIN) {
          const opp = hitOpposite(activeFacts[i].text, activeFacts[j].text)
          const sub = sharedSubject(activeFacts[i].text, activeFacts[j].text)
          if (opp && sub) conflicts.push({ a: activeFacts[i].node.id, b: activeFacts[j].node.id, reason: '一个说' + opp[0] + '一个说' + opp[1] })
        }
      }
    }
    const nowMs = Date.now()
    const staleIds = new Set()
    for (let i = 0; i < activeFacts.length; i++) {
      const f = activeFacts[i]
      if (!f.createdAt || nowMs - f.createdAt < STALE_DAYS * DAY_MS) continue
      // 和任意其他 fact 都不像（相似度都不 > 0.2）才算「长期没提」
      if (!pairs.some(([a, b, w]) => (a === i || b === i) && w > 0.2)) staleIds.add(f.node.id)
    }
    const expiredIds = new Set()
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    for (const f of activeFacts) {
      if (!EXPIRED_HINT.test(f.text)) continue
      const day = parseDay(f.text)
      if (day === null) continue
      if (day < todayStart.getTime()) expiredIds.add(f.node.id)
    }
    for (const node of nodes) {
      const fl = []
      if (staleIds.has(node.id)) fl.push('stale')
      if (expiredIds.has(node.id)) fl.push('expired')
      if (conflicts.some(c => c.a === node.id || c.b === node.id)) fl.push('conflict')
      if (fl.length) node.flags = fl
    }
    const health = { stale: staleIds.size, expired: expiredIds.size, conflict: conflicts.length, pending: pendingNodes.length }

    // —— 连边 ——
    const MAXE = 1800;
    const edgeList = []
    const chat = nodes.filter(n => n.kind === 'raw' || n.kind === 'important' || n.kind === 'core' || n.kind === 'special')
    const gs = new Map(chat.map(n => [n.id, GRAM(n.text)]))
    for (let i = 0; i < chat.length; i++) {
      const cand = []
      for (let j = 0; j < chat.length; j++) {
        if (i === j) continue
        const w = jaccard(gs.get(chat[i].id), gs.get(chat[j].id))
        if (w > 0.09) cand.push([j, w])
      }
      cand.sort((x, y) => y[1] - x[1])
      for (const c of cand.slice(0, 3)) if (c[0] > i) edgeList.push({ a: chat[i].id, b: chat[c[0]].id, w: c[1], type: 'chat' })
    }
    // [memory-hub] 每个非核心节点连一条到最相似的核心节点，形成中心星团
    const cores = chat.filter(n => n.kind === 'core')
    if (cores.length) {
      for (const n of chat) {
        if (n.kind === 'core') continue
        let best = cores[0], bw = -1
        for (const c of cores) {
          const w = jaccard(gs.get(n.id), gs.get(c.id))
          if (w > bw) { bw = w; best = c }
        }
        edgeList.push({ a: n.id, b: best.id, w: Math.max(0.08, bw), type: 'hub' })
      }
    }
    // fact：连最相似 1~2 个对话节点；fact 之间相似度 > 0.35 才连（求稳，别乱串）
    // pending：孤星，一根线都不连，等你确认了再说
    for (const f of activeFacts) {
      const fg = GRAM(f.text)
      const cand = chat.map(c => [c, jaccard(fg, gs.get(c.id))]).sort((x, y) => y[1] - x[1])
      for (const [c, w] of cand.slice(0, 2)) if (w > 0.05) edgeList.push({ a: f.node.id, b: c.id, w, type: 'fact' })
    }
    for (let i = 0; i < activeFacts.length; i++) {
      for (let j = i + 1; j < activeFacts.length; j++) {
        const w = jaccard(factGrams.get(activeFacts[i].node.id), factGrams.get(activeFacts[j].node.id))
        if (w > FACT_FACT_EDGE_MIN) edgeList.push({ a: activeFacts[i].node.id, b: activeFacts[j].node.id, w, type: 'fact' })
      }
    }
    // 边溢出：先把 fact 相关边全留下，剩下的额度按权重从高到低给普通边
    let edges = edgeList
    if (edgeList.length > MAXE) {
      const factEdges = edgeList.filter(e => e.type === 'fact')
      const rest = edgeList.filter(e => e.type !== 'fact').sort((x, y) => y.w - x.w)
      edges = factEdges.concat(rest).slice(0, MAXE)
    }
    return { nodes, edges, at: Date.now(), health, conflicts };
  }

  if (req.method === 'GET' && url.pathname === '/memory') { // [memory-map]
    try {
      const html = readFileSync('D:\\DSH\\qqbot\\panel\\memory.html', 'utf8')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html)
    } catch (e) { send(500, { ok: false, error: 'memory.html 读取失败：' + e.message }) }
    return
  }
  // [selfcheck-page] 自检记只读浏览页：每次请求重读文件，改完刷新就见效
  if (req.method === 'GET' && url.pathname === '/selfcheck') {
    try {
      const file = 'D:\\DSH\\qqbot\\小鲸鱼自检记.txt'
      const raw = readFileSync(file, 'utf8')
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const lines = raw.split(/\r?\n/)
      const isEntry = (ln) => /^\[?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(ln)
      const renderLine = (ln) => {
        const t = esc(ln)
        if (/^-{5,}\s*$/.test(ln)) return '<hr>'
        if (isEntry(ln)) {
          const m = /^\[?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\]?\s*(.*)$/.exec(ln)
          if (m) {
            let rest = m[2] || ''
            let badge = ''
            const mk = /（(鱼|dsh)[^）]*做的）\s*$/.exec(rest)
            if (mk) {
              rest = rest.replace(mk[0], '').trim()
              badge = mk[1] === '鱼'
                ? '<span class="badge fish">🐟 小鲸鱼</span>'
                : '<span class="badge dsh">🛠 dsh</span>'
            }
            return '<div class="entry">' + esc(m[1]) + badge + '</div><div class="ln body">' + (esc(rest) || '&nbsp;') + '</div>'
          }
          return '<div class="entry">' + t + '</div>'
        }
        if (/^[一二三四五六七八九十]+、/.test(ln)) return '<div class="sec">' + t + '</div>'
        return '<div class="ln">' + (t || '&nbsp;') + '</div>'
      }
      // 文件按时间正序追加；页面按解析出的时间倒序显示（最新在上）
      const parseTs = (ln) => {
        const m = /^\[?(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(ln)
        return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0
      }
      const head = []
      const blocks = []
      let cur = null
      for (const ln of lines) {
        if (isEntry(ln)) { if (cur) blocks.push(cur); cur = [ln] }
        else if (cur) cur.push(ln)
        else head.push(ln)
      }
      if (cur) blocks.push(cur)
      const decorated = blocks.map((b) => {
        const mk = /（(鱼|dsh)[^）]*做的）\s*$/.exec(b[0] || '')
        return {
          author: mk ? (mk[1] === '鱼' ? 'fish' : 'dsh') : 'none',
          ts: parseTs(b[0] || ''),
          html: b.map(renderLine).join(''),
        }
      })
      decorated.sort((a, b) => b.ts - a.ts)
      const fishCount = decorated.filter((d) => d.author === 'fish').length
      const dshCount = decorated.filter((d) => d.author === 'dsh').length
      const body = head.map(renderLine).join('')
        + decorated.map((d) => '<div class="blk" data-author="' + d.author + '">' + d.html + '</div>').join('')
      const mtime = new Date(statSync(file).mtimeMs).toLocaleString('zh-CN', { hour12: false })
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>小鲸鱼自检记</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{background:#08121f;color:#cfe3f5;margin:0;font:13px/1.78 ui-monospace,Consolas,"Microsoft YaHei",monospace}
  .wrap{max-width:1080px;margin:0 auto;padding:26px 22px 64px}
  h1{font-size:17px;color:#8fd0ff;letter-spacing:1px;margin:0 0 6px;font-weight:600}
  .meta{font-size:12px;color:#5d7fa8;margin-bottom:16px;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
  .meta button{background:rgba(10,26,46,.9);border:1px solid #1d4166;color:#9fd0ff;padding:5px 11px;border-radius:7px;cursor:pointer;font:inherit;font-size:12px}
  .meta button:hover{background:#123252;border-color:#2f6da8}
  .card{background:rgba(12,26,44,.72);border:1px solid #17395c;border-radius:10px;padding:16px 18px}
  .entry{color:#bfe4ff;font-weight:600;margin:20px 0 2px;letter-spacing:.3px}
  .entry+.ln.body{color:#cfe3f5;margin-bottom:4px}
  .blk{display:block}
  .blk+.blk{margin-top:2px}
  .meta .counts{color:#7fb2e0}
  .badge{display:inline-block;margin-left:10px;padding:1px 8px;border-radius:999px;font-weight:500;font-size:11px;vertical-align:middle}
  .badge.fish{background:rgba(46,160,120,.18);color:#7fe0b8;border:1px solid rgba(46,160,120,.45)}
  .badge.dsh{background:rgba(80,140,220,.18);color:#9cc4ff;border:1px solid rgba(80,140,220,.45)}
  .sec{color:#7fb2e0;margin-top:6px}
  .ln{white-space:pre-wrap;word-break:break-word;color:#8fb0cc}
  .entry+.ln{color:#cfe3f5}
  hr{border:0;border-top:1px dashed #1d4166;margin:14px 0}
  body{background:transparent}
  #whaleBg{position:fixed;inset:0;z-index:0;overflow:hidden;background:#05070d}
  #whaleBg video{width:100%;height:100%;object-fit:cover;display:block}
  #whaleBg .scrim{position:absolute;inset:0;background:radial-gradient(ellipse 92% 82% at 50% 42%,rgba(5,7,13,.34) 0%,rgba(5,7,13,.70) 78%,rgba(5,7,13,.82) 100%)}
  .wrap{position:relative;z-index:1}
  .card{background:rgba(6,14,26,.58);border-color:#1e3a6b}
</style></head><body>
<div id="whaleBg" aria-hidden="true"><video autoplay muted loop playsinline preload="auto"><source src="/assets/whale-bg.webm" type="video/webm"><source src="/assets/whale-bg.mp4" type="video/mp4"></video><div class="scrim"></div></div>
<div class="wrap">
<h1>小鲸鱼自检记</h1>
<div class="meta"><span>D:\\DSH\\qqbot\\小鲸鱼自检记.txt</span><span>${lines.length} 行</span><span>更新于 ${esc(mtime)} · 最新在上</span><span class="counts">🐟 ${fishCount} · 🛠 ${dshCount}</span>
<button data-filter="all">全部</button><button data-filter="fish">🐟 小鲸鱼</button><button data-filter="dsh">🛠 dsh</button>
<button onclick="location.reload()">刷新</button></div>
<div class="card">${body}</div>
</div>
<script>
document.querySelectorAll('.meta button[data-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filter
    document.querySelectorAll('.blk').forEach((el) => {
      el.style.display = (f === 'all' || el.dataset.author === f) ? '' : 'none'
    })
  })
})
</script>
</body></html>`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html)
    } catch (e) { send(500, { ok: false, error: '自检记读取失败：' + e.message }) }
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/memory') { // [memory-map]
    try { send(200, buildMemory()) } catch (e) { send(500, { ok: false, error: e.message }) }
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/memory/facts') { // [memory-v2]
    try {
      const facts = loadFacts().map(f => ({ id: f.id, text: f.text, status: f.status, src: f.src, createdAt: f.createdAt, confirmedAt: f.confirmedAt, note: f.note }))
      send(200, { facts, at: Date.now() })
    } catch (e) { send(500, { ok: false, error: e.message }) }
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/memory/recall') { // [memory-v2]
    try {
      const since = Number(url.searchParams.get('since'))
      const from = Number.isFinite(since) && since > 0 ? since : Date.now() - 120000
      let log = []
      try {
        const data = JSON.parse(readFileSync(RECALL_FILE, 'utf8').replace(/^\uFEFF/, ''))
        log = Array.isArray(data && data.log) ? data.log : []
      } catch { log = [] }
      const items = log.filter(x => x && Number(x.at) >= from).slice(-200)
      send(200, { items, at: Date.now() })
    } catch (e) { send(500, { ok: false, error: e.message }) }
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
      const text = readCfg()
      const allowUsers = getList(text, 'allowUsers')
      allowUsers.forEach((id) => ensureJunction(id))
      const adminUsers = getList(text, 'adminUsers')
      let lastHeartbeat = null
      try {
        const hb = readFileSync('D:\\DSH\\qqbot\\logs\\heartbeat.log', 'utf8').trim().split('\n').filter((l) => /sent #/.test(l))
        if (hb.length) lastHeartbeat = hb[hb.length - 1].slice(0, 19)
      } catch { /* none */ }
      const bot = botState()
      let activity = null // [activity-api]
      try { activity = JSON.parse(readFileSync('C:\\Users\\Eyjafjalla\\qq-activity.json', 'utf8')) } catch { activity = null }
      const queue = (() => { try { return readFileSync('C:\\Users\\Eyjafjalla\\qq-outbox.json', 'utf8').split('\n').filter(Boolean).length } catch { return 0 } })()
      const deferred = (() => { try { const j = JSON.parse(readFileSync('C:\\Users\\Eyjafjalla\\qq-deferred-messages.json', 'utf8')); return Array.isArray(j) ? j.length : Object.keys(j || {}).length } catch { return 0 } })() // [deferred-count]
      let douyinMin = null
      try { douyinMin = Math.round((Date.now() - (await import('node:fs')).statSync('D:\\DSH\\qqbot\\logs\\douyin-watch.log').mtimeMs) / 60000) } catch { douyinMin = null }
      return send(200, {
        activity,
        queue,
        deferred,
        douyinMin,
        runtime: bot,
        botOnline: bot?.sessions > 0,
        port6700: await portOpen(6700),
        taskEnabled: taskState() === 'Ready' || taskState() === 'Running',
        taskState: taskState(),
        lastHeartbeat,
        allowUsers,
        allowGroups: getList(text, 'allowGroups'),
        startupGreet: readGreetWhitelist(text),
        users: allowUsers.map((id) => ({ id, admin: adminUsers.includes(id), perms: permsFor(id) })),
        personas: listPersonas(),
        active: activePersona(),
        voices: listVoices(),
        voice: activeVoice(),
        rateLimit: {
          max: Number(getScalar(text, 'rateLimitMaxReplies')) || 20,
          window: Number(getScalar(text, 'rateLimitWindowSeconds')) || 60,
          effective: (() => { try { return JSON.parse(readFileSync('C:\\Users\\Eyjafjalla\\qq-effective.json', 'utf8')) } catch { return null } })(),
        },
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/persona/text') {
      const name = String(url.searchParams.get('name') || '')
      if (!/^[\w\-]+$/.test(name)) return send(400, { ok: false, error: '人设名不合法' })
      const file = `${PERSONAS}\\${name}.md`
      if (!existsSync(file)) return send(404, { ok: false, error: '没有这张卡' })
      const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
      const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? name).trim()
      return send(200, { ok: true, title, text })
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/memory/v2/')) {
      const m = await memv2()
      if (url.pathname === '/api/memory/v2/summary') {
        const facts = m.loadFacts().facts
        const inv = m.checkInvariants()
        const counts = { active: 0, pending: 0, superseded: 0, rejected: 0 }
        for (const f of facts) counts[f.status] = (counts[f.status] || 0) + 1
        return send(200, { total: facts.length, counts, invariants: inv, events: m.readEvents().length })
      }
      if (url.pathname === '/api/memory/v2/facts') {
        const status = url.searchParams.get('status')
        const facts = m.loadFacts().facts.filter(f => !status || f.status === status)
        return send(200, { facts, at: Date.now() })
      }
      if (url.pathname === '/api/memory/v2/events') {
        const project = url.searchParams.get('project') || undefined
        const limit = Number(url.searchParams.get('limit')) || 50
        return send(200, { events: m.readEvents(limit, { project }), at: Date.now() })
      }
      if (url.pathname === '/api/memory/v2/block') {
        const project = url.searchParams.get('project') || ''
        return send(200, { block: m.buildMemoryBlock({ project }), at: Date.now() })
      }
      if (url.pathname === '/api/memory/v2/timeline') {
        const days = Number(url.searchParams.get('days')) || 7
        const since = Date.now() - days * 86400000
        const evs = m.readEvents(0, {}).filter(e => e.at >= since)
        const byDay = {}
        for (const e of evs) {
          const day = new Date(e.at).toISOString().slice(0, 10)
          ;(byDay[day] ||= []).push({ id: e.id, title: e.title, project: e.project, who: e.who })
        }
        const daysArr = Object.keys(byDay).sort().map(day => ({ day, events: byDay[day] }))
        return send(200, { days: daysArr, at: Date.now() })
      }
      if (url.pathname === '/api/memory/v2/search') {
        const q = url.searchParams.get('q') || ''
        const project = url.searchParams.get('project') || undefined
        return send(200, { hits: m.searchEvents(q, { project }), at: Date.now() })
      }
      return send(404, { ok: false, error: '未知 v2 接口' })
    }

    if (req.method === 'POST') {
      let raw = ''
      for await (const c of req) raw += c
      if (url.pathname === '/api/memory/facts/confirm' && raw.length > 4096) return send(413, { ok: false, error: 'body 过大' })
      const body = raw ? JSON.parse(raw.replace(/^\uFEFF/, '')) : {}
      const text = readCfg()

      if (url.pathname === '/api/memory/v2/cleanup-tests') {
        try {
          const m = await memv2()
          return send(200, { ok: true, ...m.cleanupTestFacts() })
        } catch (e) {
          return send(500, { ok: false, error: String(e.message || e) })
        }
      }
      if (url.pathname === '/api/memory/v2/fact') {
        try {
          const m = await memv2()
          const fact = m.addFact({
            subject: String((body && body.subject) || ''),
            claim: String((body && body.claim) || ''),
            value: body && body.value,
            value_type: body && body.value_type,
            tags: (body && body.tags) || [],
            source: (body && body.source) || null,
            status: 'pending',
          })
          return send(200, { ok: true, fact })
        } catch (e) {
          return send(400, { ok: false, error: String(e.message || e) })
        }
      }
      if (url.pathname === '/api/memory/v2/confirm') {
        const id = String((body && body.id) || '')
        const approve = body && body.approve === true
        if (!id) return send(400, { ok: false, error: 'id 不能为空' })
        try {
          const m = await memv2()
          const fact = m.confirmFact(id, approve)
          return send(200, { ok: true, fact })
        } catch (e) {
          return send(404, { ok: false, error: String(e.message || e) })
        }
      }

      if (url.pathname === '/api/memory/facts/confirm') { // [memory-v2]
        const id = String((body && body.id) || '')
        const approve = body && body.approve === true
        if (/^f-\d+$/.test(id)) {
          try {
            const m = await memv2()
            const fact = m.confirmFact(id, approve)
            return send(200, { ok: true, fact: { id: fact.id, status: fact.status, confirmedAt: fact.recorded_at } })
          } catch (e) {
            return send(404, { ok: false, error: String(e.message || e) })
          }
        }
        if (!FACT_ID_RE.test(id)) return send(400, { ok: false, error: 'id 不合法' })
        const facts = loadFacts()
        const target = facts.find(f => f.id === id)
        if (!target) return send(404, { ok: false, error: '没有这条记忆' })
        const now = Date.now()
        const store = readSharedStore()
        let changed = 0
        const want = normalizeFactText(target.text)
        for (const item of store.facts) {
          if (!item || typeof item !== 'object') continue
          const t = String(item.text || '').replace(/\s+/g, ' ').trim()
          if (!t || normalizeFactText(t) !== want) continue
          // true → active + confirmedAt；false → rejected，text 保留，只标记不删
          item.status = approve ? 'active' : 'rejected'
          if (approve) item.confirmedAt = now
          else delete item.confirmedAt
          changed++
        }
        if (!changed) return send(404, { ok: false, error: '没有这条记忆' })
        writeSharedStore(store)
        return send(200, { ok: true, fact: { id, status: approve ? 'active' : 'rejected', confirmedAt: approve ? now : 0 } })
      }

      if (url.pathname === '/api/open-folder') {
        // 原来的写法 execFileSync('explorer.exe', [PERSONAS], { windowsHide: true }) 有个坑：
        // explorer 作为子进程继承了 SW_HIDE，窗口建出来 Visible=False，用户点了像没反应（实测攒了 5 个隐藏窗口）。
        // 现在改交 open-folder.vbs：wscript 是 GUI 子系统、没有控制台，再由 Shell.Application.Explore 开窗
        //（窗口由 explorer 自己的 COM 服务创建，跟本进程的显示状态无关），最后把窗口置前。
        const target = String(body.path || PERSONAS)
        const safe = /^(D:\\DSH\\qqbot|C:\\Users\\Eyjafjalla)\\/.test(target) ? target : PERSONAS
        try {
          const child = spawn('wscript.exe', ['D:\\DSH\\qqbot\\panel\\open-folder.vbs', safe],
            { detached: true, stdio: 'ignore', windowsHide: false })
          child.on('error', () => {})
          child.unref()
        } catch { /* 打不开就算了，不影响其他功能 */ }
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/perm') {
        const user = String(body.user ?? '').trim()
        if (!/^\d{5,12}$/.test(user)) return send(400, { ok: false, error: 'QQ 号不合法' })
        setPerm(user, String(body.key), body.value === true)
        triggerReload()
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/admin') {
        const user = String(body.user ?? '').trim()
        if (!/^\d{5,12}$/.test(user)) return send(400, { ok: false, error: 'QQ 号不合法' })
        const list = getList(text, 'adminUsers')
        const next = body.enabled ? [...new Set([...list, user])] : list.filter((x) => x !== user)
        backup()
        writeFileSync(PROFILE, setList(text, 'adminUsers', next), 'utf8')
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/whitelist') {
        const key = body.kind === 'groups' ? 'allowGroups' : 'allowUsers'
        const list = getList(text, key)
        let next = list
        if (body.add) {
          const v = String(body.add).trim()
          if (!/^\d{5,12}$/.test(v)) return send(400, { ok: false, error: '号码不合法' })
          next = [...new Set([...list, v])]
          ensureJunction(v)
        } else if (body.remove) next = list.filter((x) => x !== String(body.remove))
        backup()
        writeFileSync(PROFILE, setList(text, key, next), 'utf8')
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/startup-greet') {
        const data = readGreetWhitelist(text)
        const action = String(body.action || 'add')
        const id = String(body.id || '').trim()
        if (!/^\d{5,12}$/.test(id)) return send(400, { ok: false, error: 'QQ 号不合法' })
        if (id === data.owner.id && action === 'remove') return send(400, { ok: false, error: '主人是锁定项，不能移除' })
        if (action === 'remove') {
          data.friends = data.friends.filter((f) => f.id !== id)
        } else if (action === 'toggle') {
          const target = data.friends.find((f) => f.id === id)
          if (!target) return send(404, { ok: false, error: '不在启动问候白名单' })
          target.enabled = body.enabled !== false
        } else {
          const allowed = getList(text, 'allowUsers')
          if (!allowed.includes(id)) return send(400, { ok: false, error: '先把这个号加入私聊白名单，否则消息发不出去' })
          const name = String(body.name || '').trim() || id
          const existing = data.friends.find((f) => f.id === id)
          if (existing) { existing.name = name; existing.enabled = true }
          else data.friends.push({ id, name, enabled: true })
        }
        writeGreetWhitelist(data)
        return send(200, { ok: true, startupGreet: data })
      }

      if (url.pathname === '/api/task') {
        const enable = body.enabled === true
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `${enable ? 'Enable' : 'Disable'}-ScheduledTask -TaskName '${TASK}' -ErrorAction Stop`], { encoding: 'utf8' })
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/rate') {
        const max = Number(body.max)
        const win = Number(body.window)
        if (!Number.isFinite(max) || max < 1 || max > 60) return send(400, { ok: false, error: '条数需要在 1~60' })
        if (!Number.isFinite(win) || win < 10 || win > 600) return send(400, { ok: false, error: '窗口需要在 10~600 秒' })
        backup()
        let t = readCfg()
        t = t.replace(/^(\s*)rateLimitMaxReplies:.*$/m, (_m, i) => `${i}rateLimitMaxReplies: ${Math.round(max)}`)
        t = t.replace(/^(\s*)rateLimitWindowSeconds:.*$/m, (_m, i) => `${i}rateLimitWindowSeconds: ${Math.round(win)}`)
        writeFileSync(PROFILE, t, 'utf8')
        triggerReload()
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/voice') {
        applyVoice(String(body.id ?? ''))
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/open-voice-dir') {
        try { spawn('explorer.exe', ['D:\\DSH\\voice\\profiles'], { detached: true, stdio: 'ignore' }).unref() } catch { }
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/persona') {
        applyPersona(String(body.name ?? ''))
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/reset-sessions') {
        const f = 'C:\\\\Users\\\\Eyjafjalla\\\\qq-sessions.json'
        try { if (existsSync(f)) copyFileSync(f, f + '.bak-' + Date.now()) } catch { }
        writeFileSync(f, '{}', 'utf8')
        triggerReload()
        return send(200, { ok: true })
      }

      if (url.pathname === '/api/reload') { triggerReload(); return send(200, { ok: true }) }

      return send(404, { ok: false, error: '未知接口' })
    }

    return send(404, { ok: false, error: 'not found' })
  } catch (error) {
    return send(500, { ok: false, error: String(error?.message ?? error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`panel listening on http://127.0.0.1:${PORT}`)
  // [memory-v2] 每 10 分钟自动抽取候选事实（只写 pending，人工确认）
  setInterval(() => {
    try {
      if (!existsSync('D:\\DSH\\qqbot\\data\\memory\\USE_V2')) return
      for (const script of ['extract_pending.mjs', 'ingest_selfcheck.mjs']) {
        const p = spawn('C:\\Program Files\\nodejs\\node.exe',
          ['D:\\DSH\\qqbot\\data\\memory\\' + script, '--quiet'],
          { detached: true, stdio: 'ignore', windowsHide: true })
        p.unref()
      }
    } catch (e) { console.warn('[memory-v2] extract spawn failed: ' + e.message) }
  }, 10 * 60 * 1000)
})
