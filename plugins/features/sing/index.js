// 唱歌模块：曲库点歌 / 歌词 / 段落标注 / 入库调度
// 只依赖注入进来的 bridge / defineTool，不再直接写在 bridge.js 里。
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { basename, join } from 'node:path'

const LIB_ROOT = 'D:\\DSH\\sing\\library'
const SONGS_DIR = LIB_ROOT + '\\songs'
const LIB_FILE = LIB_ROOT + '\\library.json'
const CAUTION_FILE = LIB_ROOT + '\\caution.json'
const STAGING_DIR = LIB_ROOT + '\\staging'
const INCOMING_DIR = LIB_ROOT + '\\incoming'
const INGEST_LOCK = 'D:\\DSH\\sing\\logs\\ingest.lock'
const PYTHON = 'D:\\DSH\\voice\\env\\Scripts\\python.exe'
const INGEST_SCRIPT = 'D:\\DSH\\sing\\library\\tools\\auto_ingest.py'
const FFMPEG = 'C:\\Users\\Eyjafjalla\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'

function absPath(p) {
  const s = String(p || '')
  if (!s) return ''
  return /^[A-Za-z]:[\\/]/.test(s) ? s : join(LIB_ROOT, s)
}

function loadJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

function findInList(list, name) {
  const want = norm(name)
  return (Array.isArray(list) ? list : []).find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n) === want))
    || (Array.isArray(list) ? list : []).find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n).includes(want) || want.includes(norm(n))))
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s《》「」“”"'’]/g, '')
}

function findSong(lib, name) {
  const want = norm(name)
  const songs = Array.isArray(lib && lib.songs) ? lib.songs : []
  return songs.find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n) === want))
    || songs.find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n).includes(want) || want.includes(norm(n))))
}

export function registerSingTools({ defineTool, agentCtx, route, key, bridge }) {
  // [qq-sing 2026-11-06] 用本兮声线唱曲库里的歌：默认从第一句歌词开始、清唱、最长 60 秒
  agentCtx.tools.register(defineTool({
    name: 'qq_sing',
    description: '用本兮声线唱曲库里的歌。默认从第一句歌词开始、清唱、最长 60 秒；可加伴奏。',
    parameters: {
      title: { type: 'string', required: true, description: '歌名，例如 特别的人 / 唯一' },
      start: { type: 'number', description: '从第几秒开始；省略=自动跳到第一句歌词' },
      seconds: { type: 'number', description: '唱多少秒，默认 60，最多 60' },
      accomp: { type: 'boolean', description: '是否带伴奏，默认 false（清唱）' },
      section: { type: 'string', description: '段落名，例如 副歌1 / 主歌2；省略则从第一句歌词' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { sent: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      // [sing-ungate] 写闸门会因 ttsEnabled=false 误杀白名单成员；权限由工具守卫白名单负责
      if (bridge.injectionSuppressed(key)) { bridge.markSuppressed(key, '唱歌'); return { sent: false, detail: '注入回合：出站已被 dry-run 拦下（未发送）' } }

      const libFile = 'D:\\DSH\\sing\\library\\library.json'
      let lib = null
      try { lib = JSON.parse(readFileSync(libFile, 'utf8')) } catch (e) { return { sent: false, detail: '曲库读取失败：' + e.message } }
      const norm = (x) => String(x || '').toLowerCase().replace(/[\s《》「」“”"'’]/g, '')
      const want = norm(args.title)
      const songs = Array.isArray(lib && lib.songs) ? lib.songs : []
      const song = songs.find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n) === want))
        || songs.find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n).includes(want) || want.includes(norm(n))))
      if (!song) {
        const caution = loadJson(CAUTION_FILE)
        const cau = findInList(caution?.songs, args.title)
        if (cau) {
          return { sent: false, detail: '《' + cau.title + '》有音域警告，但这条记录的音频还没入库，暂时唱不了。' }
        }
        let stageHit = null
        try {
          for (const d of readdirSync(STAGING_DIR)) {
            const m = loadJson(join(STAGING_DIR, d, 'meta.json'))
            if (m && findInList([m], args.title)) { stageHit = m; break }
          }
        } catch { }
        if (stageHit) {
          return { sent: false, detail: '《' + stageHit.title + '》已经收歌，正在处理中（' + (stageHit.status || 'staged') + '），还没到可唱状态。' }
        }
        try {
          for (const f of readdirSync(INCOMING_DIR)) {
            if (!/\.(flac|mp3|wav|m4a|ogg)$/i.test(f)) continue
            const title = f.replace(/\.[^.]+$/, '').split(' - ').pop()
            if (norm(title) === norm(args.title)) {
              return { sent: false, detail: '《' + title + '》已经收歌，等待分离/分析，还没到可唱状态。' }
            }
          }
        } catch { }
        return { sent: false, detail: '不会唱《' + args.title + '》。把原曲发给我、或放进 D:\\DSH\\sing\\library\\incoming\\ 我就学。' }
      }
      const vocal = absPath(song.vocal || song.file)
      if (!vocal || !existsSync(vocal)) return { sent: false, detail: '曲库里《' + song.title + '》的干声不见了：' + vocal }

      const autoStart = Number(song.vocal_start) || 0
      let start = args.start === undefined || args.start === null ? autoStart : Math.max(0, Number(args.start) || 0)
      const secName = String(args.section || '').trim()
      if (secName) {
        const secs = Array.isArray(song.sections) ? song.sections : []
        const sec = secs.find((x) => x.name === secName) || secs.find((x) => String(x.name).includes(secName) || secName.includes(String(x.name)))
        if (!sec) {
          return { sent: false, detail: '《' + song.title + '》还没标段落。已标：' + (secs.length ? secs.map((x) => x.name).join('、') : '无') + '。可以用 qq_sing_lyrics 看歌词、qq_sing_save_sections 标段落。' }
        }
        start = Math.max(0, Number(sec.start) || 0)
      }
      const requested = Math.max(5, Math.min(60, Number(args.seconds) || 60))
      const maxEnd = start + requested
      // 末尾对齐句末：在 <= maxEnd 的人声停顿点里取最后一个
      // 优先用歌词行起点（LRC）断句，其次用静音停顿点
      let cuts = (song.line_starts || []).filter((x) => Number(x) > start + 5 && Number(x) <= maxEnd)
      let cutAdjust = -0.15
      if (!cuts.length) { cuts = (song.phrase_ends || []).filter((x) => Number(x) > start + 6 && Number(x) <= maxEnd); cutAdjust = 0 }
      let end = cuts.length ? Math.max(...cuts.map(Number)) + cutAdjust : maxEnd
      // 句末离上限太远（>12s）时，宁可切在句中也别只唱一小段
      if (maxEnd - end > 12) end = maxEnd
      const dur = Math.round(Math.max(5, Math.min(60, end - start)))
      const wantAccomp = args.accomp === true
      const accompPath = absPath(song.accomp || song.instrumental)
      const accomp = wantAccomp && accompPath && existsSync(accompPath) ? accompPath : null
      const caution = song.status === 'caution' || song.quality === 'caution'
      const notice = caution ? '这首歌的音域对当前模型不太友好，可能唱得没那么好听，我先唱，你听听看。' : ''
      let warned = false
      if (caution) {
        try {
          await bridge.server.sendSegments(route.bot, route.messageType, route.targetId,
            [{ type: 'text', data: { text: notice } }])
          warned = true
        } catch { /* fall back to including the warning in the final text */ }
      }

      const tmp = join(process.env.TEMP || '.', 'qq_sing_' + Date.now() + '.wav')
      const ffmpeg = 'C:\\Users\\Eyjafjalla\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
      const argsF = accomp
        ? ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(dur), '-i', vocal,
           '-ss', String(start), '-t', String(dur), '-i', accomp,
           '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11',
           '-ar', '44100', '-ac', '1', tmp]
        : ['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(dur), '-i', vocal,
           '-ar', '44100', '-ac', '1', tmp]
      try {
        execFileSync(ffmpeg, argsF, { timeout: 120000 })
      } catch (e) {
        return { sent: false, detail: '切片失败：' + (e.message || e) }
      }
      try {
        const voiceSrc = 'base64://' + readFileSync(tmp).toString('base64')
        await bridge.sendVoice(route, [{ type: 'record', data: { file: voiceSrc } }])
      } finally {
        try { unlinkSync(tmp) } catch { }
      }
      const mmss = (x) => Math.floor(x / 60) + ':' + String(Math.round(x % 60)).padStart(2, '0')
      const mode = accomp ? '带伴奏' : '清唱'
      const tail = (wantAccomp && !accomp) ? '（这首没有伴奏文件，只能清唱）' : ''
      return { sent: true, detail: (caution && !warned ? notice : '') + '唱了《' + song.title + '》' + mmss(start) + '–' + mmss(start + dur) + '，' + dur + ' 秒，' + mode + tail }
    },
  }))

  // [qq-sing-list] 曲库清单
  agentCtx.tools.register(defineTool({
    name: 'qq_sing_list',
    description: '列出第一档：已经学会、现在能唱的歌（名字 + 时长）。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute() {
      const libFile = 'D:\\DSH\\sing\\library\\library.json'
      let lib = null
      try { lib = JSON.parse(readFileSync(libFile, 'utf8')) } catch (e) { return { detail: '曲库读取失败：' + e.message } }
      const songs = Array.isArray(lib && lib.songs) ? lib.songs : []
      if (!songs.length) return { detail: '曲库是空的，可以发原曲给我学。' }
      const lines = songs.map((s, i) => {
        const d = Number(s.duration) || 0
        const mm = Math.floor(d / 60) + ':' + String(Math.round(d % 60)).padStart(2, '0')
        const al = (s.aliases && s.aliases.length) ? '（别名：' + s.aliases.join('、') + '）' : ''
        const warn = s.status === 'caution' ? ' [音域警告，可能不好听]' : ''
        return (i + 1) + '. ' + s.title + ' ' + mm + al + warn
      })
      const caution = songs.filter((s) => s.status === 'caution').length
      return { detail: '曲库共 ' + songs.length + ' 首（其中 ' + caution + ' 首有音域警告）：\n' + lines.join('\n') }
    },
  }))

  // [qq-sing-caution] 第 2 档：已推理，但音域/转调不友好
  agentCtx.tools.register(defineTool({
    name: 'qq_sing_rejected',
    description: '列出已推理、但音域/转调对模型不友好的歌（第二档，会先提醒再唱）。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute() {
      const lib = loadJson(LIB_FILE) || { songs: [] }
      let songs = (Array.isArray(lib.songs) ? lib.songs : []).filter((s) => s.status === 'caution')
      if (!songs.length) {
        const data = loadJson(CAUTION_FILE) || { songs: [] }
        songs = Array.isArray(data.songs) ? data.songs : []
      }
      if (!songs.length) return { detail: '第二档目前是空的：没有音域警告的歌。' }
      return {
        detail: '第二档（音域警告，仍可唱，可能不好听）共 ' + songs.length + ' 首：\n'
          + songs.map((s, i) => (i + 1) + '. ' + s.title + ' — ' + (s.reason_text || s.reason || '音域不太友好')).join('\n'),
      }
    },
  }))

  // [qq-sing-lyrics] 取带时间轴的歌词；本地没有就自动去网上抓
  agentCtx.tools.register(defineTool({
    name: 'qq_sing_lyrics',
    description: '取某首歌带时间轴的歌词（本地没有会自动去网易云抓并入库），用来判断主歌/副歌。',
    parameters: { title: { type: 'string', required: true, description: '歌名' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const libFile = 'D:\\DSH\\sing\\library\\library.json'
      const norm = (x) => String(x || '').toLowerCase().replace(/[\s《》「」“”"'’]/g, '')
      const want = norm(args.title)
      let lib = null
      try { lib = JSON.parse(readFileSync(libFile, 'utf8')) } catch (e) { return { detail: '曲库读取失败：' + e.message } }
      const songs = Array.isArray(lib && lib.songs) ? lib.songs : []
      let song = songs.find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n) === want))
        || songs.find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n).includes(want)))
      if (!song) return { detail: '曲库里没有《' + args.title + '》。' }
      // v1 stores timed lyrics in songs/<id>/lyrics.json, not inline in the index.
      let lines = Array.isArray(song.lyrics) ? song.lyrics : []
      if (!lines.length && song.id) {
        const data = loadJson(join(SONGS_DIR, song.id, 'lyrics.json'))
        lines = Array.isArray(data?.lines) ? data.lines : []
      }
      if (!lines.length) {
        const secs = Array.isArray(song.sections) ? song.sections : []
        return { detail: '《' + song.title + '》没有可用的带时间歌词' + (secs.length ? '，但已有 ' + secs.length + ' 个段落：' + secs.map((x) => x.name).join('、') : '。') }
      }
      const mmss = (x) => Math.floor(x / 60) + ':' + String(Math.round(x % 60)).padStart(2, '0')
      const body = lines.map((l) => mmss(l.t) + ' ' + l.text).join('\n')
      return { detail: '《' + song.title + '》歌词（' + lines.length + ' 行）：\n' + body }
    },
  }))

  // [qq-sing-sections] 保存她判断出来的段落
  agentCtx.tools.register(defineTool({
    name: 'qq_sing_save_sections',
    description: '保存某首歌的段落划分。sections 是 JSON 字符串，例如 [{"name":"主歌1","start":15.1,"end":42.0}]',
    parameters: {
      title: { type: 'string', required: true, description: '歌名' },
      sections: { type: 'string', required: true, description: 'JSON 数组字符串' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      const libFile = 'D:\\DSH\\sing\\library\\library.json'
      const norm = (x) => String(x || '').toLowerCase().replace(/[\s《》「」“”"'’]/g, '')
      const want = norm(args.title)
      let sections = null
      try { sections = JSON.parse(String(args.sections || '')) } catch (e) { return { detail: 'sections 不是合法 JSON：' + e.message } }
      if (!Array.isArray(sections) || !sections.length) return { detail: 'sections 必须是非空数组' }
      const clean = []
      for (const s of sections) {
        const name = String(s && s.name || '').trim()
        const start = Number(s && s.start)
        const end = Number(s && s.end)
        if (!name || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return { detail: '段落格式不对：' + JSON.stringify(s) }
        }
        clean.push({ name, kind: String(s.kind || ''), start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 })
      }
      let lib = null
      try { lib = JSON.parse(readFileSync(libFile, 'utf8')) } catch (e) { return { detail: '曲库读取失败：' + e.message } }
      const song = (lib.songs || []).find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n) === want))
        || (lib.songs || []).find((s) => [s.title, ...(s.aliases || [])].some((n) => norm(n).includes(want)))
      if (!song) return { detail: '曲库里没有《' + args.title + '》。' }
      song.sections = clean
      song.needs_sections = false
      writeFileSync(libFile, JSON.stringify(lib, null, 2), 'utf8')
      if (song.id) {
        try {
          const dir = join(SONGS_DIR, song.id)
          writeFileSync(join(dir, 'sections.json'), JSON.stringify({ schema_version: '1.0', sections: clean, needs_sections: false }, null, 2), 'utf8')
          const metaFile = join(dir, 'meta.json')
          const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
          meta.sections = { path: 'songs/' + song.id + '/sections.json', needs_sections: false }
          writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8')
        } catch { /* index is the source for playback */ }
      }
      return { detail: '已保存《' + song.title + '》的 ' + clean.length + ' 段：' + clean.map((x) => x.name).join('、') }
    },
  }))

  // [qq-sing-incoming] 看第三档：还没学的原曲
  agentCtx.tools.register(defineTool({
    name: 'qq_sing_incoming',
    description: '列出第三档：incoming 里还没学、还没处理的原曲。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute() {
      const dir = 'D:\\DSH\\sing\\library\\incoming'
      let files = []
      try { files = readdirSync(dir).filter((f) => /\.(flac|mp3|wav|m4a|ogg)$/i.test(f)) } catch (e) { return { detail: '读不到 incoming：' + e.message } }
      if (!files.length) return { detail: '第三档是空的：incoming 里没有还没学的歌。' }
      return { detail: '第三档（还没学）共 ' + files.length + ' 首：\n' + files.map((f, i) => (i + 1) + '. ' + f).join('\n') }
    },
  }))

  // [qq-sing-ingest] 本地只做“分离 + 分析”；SVC 推理改由周末云端批处理
  agentCtx.tools.register(defineTool({
    name: 'qq_sing_ingest',
    description: '对 incoming 前 3 首做分离 + F0 分析，进入 staging；SVC 推理和混音在周末云端批处理完成。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute() {
      const dir = 'D:\\DSH\\sing\\library\\incoming'
      const script = 'D:\\DSH\\sing\\library\\tools\\auto_ingest.py'
      let files = []
      try { files = readdirSync(dir).filter((f) => /\.(flac|mp3|wav|m4a|ogg)$/i.test(f)) } catch (e) { return { detail: '读不到 incoming：' + e.message } }
      if (!files.length) return { detail: 'incoming 是空的，没有要处理的歌。' }
      try {
        const child = spawn('D:\\DSH\\sing\\svc_env212\\Scripts\\python.exe',
          [script, '--all', '--limit', '3', '--model', 'htdemucs'],
          { cwd: 'D:\\DSH\\sing\\library', detached: true, stdio: 'ignore', windowsHide: true })
        child.unref()
      } catch (e) {
        return { detail: '启动失败：' + (e.message || e) }
      }
      return { detail: '已启动本地处理前 3 首：分离 + F0 分析，进入 staging。SVC 推理在周末云端完成。' }
    },
  }))

}

export const hooks = { registerSingTools }
