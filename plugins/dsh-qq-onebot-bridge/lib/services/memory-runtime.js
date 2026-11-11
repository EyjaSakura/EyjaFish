// Memory + self-state runtime: per-chat rolling history, shared memory blocks,
// contacts-derived self-state, and atomic self-state writes.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { buildMemoryBlockV2, buildSharedMemoryBlock } from './memory-blocks.js'
import { readContacts, contactLine as contactLineOf } from './contacts-store.js'
import { selfStateBlock as selfStateBlockService } from './self-state-block.js'

const CONTACTS_FILE = 'D:\\DSH\\qqbot\\data\\contacts.json'
const SELF_STATE_FILE = 'D:\\DSH\\qqbot\\data\\self-state.json'
const SHARED_MEMORY_FILE = 'D:\\DSH\\qqbot\\data\\shared-memory.json'
const MEMORY_V2_DIR = 'D:\\DSH\\qqbot\\data\\memory'

export function createMemoryRuntime({ memoryDir, config, debugLog }) {
  const memoryFile = (key) => join(memoryDir, `${String(key).replace(/[^\w-]/g, '_')}.json`)

  function contactsInfo() {
    return readContacts({
      file: process.env.QQ_CONTACTS_FILE || CONTACTS_FILE,
      exists: existsSync,
      readFile: readFileSync,
      debugLog,
    })
  }

  function contactLine(chatKey) {
    try {
      return contactLineOf(chatKey, contactsInfo().all)
    } catch {
      return ''
    }
  }

  function memoryBlockV2() {
    return buildMemoryBlockV2({
      dir: MEMORY_V2_DIR,
      count: contactsInfo().count,
      exists: existsSync,
      readFile: readFileSync,
      writeFile: writeFileSync,
      appendFile: appendFileSync,
    })
  }

  function loadMemoryLines(key) {
    try {
      const file = memoryFile(key)
      if (!existsSync(file)) return []
      const data = JSON.parse(readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''))
      if (!Array.isArray(data?.history)) return []
      return data.history.map((h) => `${h.role === 'user' ? '用户' : '助手'}: ${String(h.text ?? '').slice(0, 800)}`)
    } catch (error) {
      debugLog(`memory load failed: ${error.message}`)
      return []
    }
  }

  function sharedMemoryBlock(chatKey) {
    try {
      const v2 = memoryBlockV2()
      if (v2) return v2
    } catch (error) { debugLog('[memory-v2] ' + error.message) }
    return buildSharedMemoryBlock({
      file: process.env.QQ_SHARED_MEMORY || SHARED_MEMORY_FILE,
      chatKey,
      count: contactsInfo().count,
      exists: existsSync,
      readFile: readFileSync,
      writeFile: writeFileSync,
      createHash,
    })
  }

  function selfStatePath() {
    return process.env.QQ_SELF_STATE || SELF_STATE_FILE
  }

  function readSelfState() {
    const file = selfStatePath()
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!existsSync(file)) return null
        const j = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
        return j && typeof j === 'object' ? j : null
      } catch (e) {
        if (attempt === 0) {
          try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100) } catch { }
          continue
        }
        debugLog('[self-state] read failed: ' + e.message)
        return null
      }
    }
    return null
  }

  function setSelfState(activity, detail, withWhom) {
    try {
      const act = String(activity ?? '').trim().slice(0, 40)
      if (!act) return false
      const now = Date.now()
      const cur = readSelfState() || {}
      const obj = {
        activity: act,
        detail: String(detail ?? '').trim().slice(0, 80),
        since: cur.activity === act && Number(cur.since) > 0 ? Number(cur.since) : now,
        withWhom: String(withWhom ?? '').trim().slice(0, 20),
        updatedAt: now,
      }
      const file = selfStatePath()
      const tmp = file + '.tmp-' + process.pid + '-' + now
      writeFileSync(tmp, JSON.stringify(obj, null, 4), 'utf8')
      renameSync(tmp, file)
      debugLog('[self-state] ' + obj.activity + (obj.withWhom ? ' / ' + obj.withWhom : ''))
      return true
    } catch (e) {
      debugLog('[self-state] write failed: ' + e.message)
      return false
    }
  }

  function selfStateBlock(chatKey) {
    return selfStateBlockService({
      chatKey,
      readState: () => readSelfState(),
      contactLine: (key) => contactLine(key),
      now: Date.now(),
    })
  }

  function recordMemory(key, role, text) {
    if (!config.memoryEnabled) return
    const clean = String(text ?? '').trim().slice(0, 1000)
    if (clean === '') return
    try {
      mkdirSync(memoryDir, { recursive: true })
      const file = memoryFile(key)
      let history = []
      if (existsSync(file)) {
        try { history = JSON.parse(readFileSync(file, 'utf8').replace(/^\\uFEFF/, '')).history ?? [] } catch {}
      }
      history.push({ role, text: clean, ts: Date.now() })
      const max = Math.max(1, Number(config.memoryMaxEntries) || 30)
      history = history.slice(-max)
      writeFileSync(file, JSON.stringify({ updatedAt: Date.now(), history }, null, 2), 'utf8')
    } catch (error) {
      debugLog(`memory write failed: ${error.message}`)
    }
  }

  function clearMemory(key) {
    try {
      const file = memoryFile(key)
      if (existsSync(file)) unlinkSync(file)
    } catch (error) {
      debugLog(`memory clear failed: ${error.message}`)
    }
  }

  return { contactsInfo, loadMemoryLines, sharedMemoryBlock, setSelfState, selfStateBlock, recordMemory, clearMemory }
}
