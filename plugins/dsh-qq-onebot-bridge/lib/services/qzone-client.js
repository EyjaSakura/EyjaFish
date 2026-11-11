// QQ 空间客户端：cookie/bkn 获取（live 或文件缓存）+ 说说列表拉取。
// 纯服务，socket/action/request 均可注入，便于单测。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const QZONE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** @param {any} args */
export function createQzoneClient({ getSocket, action, request, memoryDir, debugLog = () => {}, now = Date.now }) {
  let cache = null

  async function auth() {
    const socket = getSocket()
    if (socket) {
      try {
        const r = await action(socket, 'get_cookies', { domain: 'qzone.qq.com' })
        const cookies = String((r && (r.cookies || r.data?.cookies)) || '')
        const bkn = String((r && (r.bkn || r.data?.bkn)) || '')
        const uin = (cookies.match(/(?:^|;\s*)uin=o?(\d+)/) || [])[1] || ''
        if (cookies && bkn && uin) {
          cache = { cookies, bkn, uin, at: now() }
          return { socket, cookies, bkn, uin }
        }
      } catch (error) {
        debugLog('[qzone-cache] live auth failed: ' + error.message)
      }
    }
    let c = cache
    if (!c || !c.cookies) {
      try {
        c = JSON.parse(readFileSync(join(memoryDir, '..', 'qq-qzone-cookies.json'), 'utf8'))
        cache = c
      } catch {
        c = null
      }
    }
    if (c && c.cookies && now() - c.at < CACHE_TTL_MS) {
      return { socket: null, cookies: c.cookies, bkn: c.bkn, uin: c.uin }
    }
    throw new Error('QQ 没连上（且没有可用的 qzone cookie 缓存）')
  }

  async function fetchList(limit = 5) {
    const { cookies, bkn, uin } = await auth()
    const url = 'https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin=' + uin
      + '&ftype=0&sort=0&pos=0&num=' + limit + '&replynum=50&g_tk=' + bkn
      + '&code=0&format=json&inCharset=utf-8&outCharset=utf-8&ref=feeds&qzonetoken=&callback=&_=' + now()
    const resp = await request(url, {
      headers: { 'user-agent': QZONE_UA, referer: 'https://user.qzone.qq.com/' + uin, cookie: cookies },
      signal: AbortSignal.timeout(20000),
    })
    let j = resp
    if (typeof j === 'string') {
      const t = j.trim()
      const jsonText = t.startsWith('{') ? t : t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'))
      j = jsonText.trim() === '' ? null : JSON.parse(jsonText)
    }
    if (!j) throw new Error('空间列表返回为空')
    if (j.code !== 0) throw new Error('空间列表失败：' + (j.message || j.code))
    return { list: j.msglist || [], uin }
  }

  return { auth, fetchList }
}
