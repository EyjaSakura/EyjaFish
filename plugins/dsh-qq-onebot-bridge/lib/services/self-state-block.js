// "我现在的状态" 系统提示段（三个窗口共享）。
export function selfStateBlock({ chatKey, readState, contactLine, now = Date.now() }) {
  try {
    const st = readState()
    if (!st || !st.activity) return ''
    const act = String(st.activity).slice(0, 40)
    const since = Number(st.since) || 0
    const upd = Number(st.updatedAt) || since
    const stale = now - upd > 30 * 60_000
    const hhmm = (ts) => {
      try {
        const d = new Date(ts)
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      } catch { return '' }
    }
    let line
    if (stale) {
      line = '刚在' + act + '，现在应该空闲了。'
    } else {
      const t = since ? hhmm(since) : ''
      const w = st.withWhom ? '，和' + String(st.withWhom).slice(0, 20) + '一起' : ''
      line = '你现在正在：' + act + (t ? '（' + t + ' 开始' + w + '）' : '') + '。'
    }
    let out = '【我的状态｜三个窗口同一份，只共享这一句】\n' + line + '\n问你在干嘛就按这个答，不确定就说刚在忙，不要编。'
    const objLine = contactLine(chatKey)
    if (objLine) out += '\n' + objLine
    if (out.length > 120) out = out.slice(0, 120)
    return out
  } catch { return '' }
}
