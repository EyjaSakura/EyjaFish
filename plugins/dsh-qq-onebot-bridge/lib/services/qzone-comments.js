// QQ 空间评论扫描：从说说列表里找出新评论/楼中楼，生成注入文案。

export function scanQzoneComments({ list, seen, uin, now = Date.now(), windowHours = 24, maxPending = 4 }) {
  const seenSet = new Set(Array.isArray(seen) ? seen : [])
  const pending = []
  for (const post of (Array.isArray(list) ? list : [])) {
    for (const c of (post.commentlist || [])) {
      if (pending.length >= 3) break
      const ctid = String(c.tid || '')
      const key = String(post.tid) + ':' + ctid
      // 楼中楼无论一级评论是否已读都要扫
      for (const r of (c.list_3 || [])) {
        if (pending.length >= maxPending) break
        const rtid = String(r.tid || '')
        if (!rtid) continue
        const rkey = String(post.tid) + ':' + ctid + ':r' + rtid
        if (seenSet.has(rkey)) continue
        seenSet.add(rkey)
        if (String(r.uin || '') === String(uin)) continue
        const ct = Number(r.create_time || 0) * 1000
        if (ct && now - ct > (Number(windowHours) || 24) * 3600_000) continue
        const clean = String(r.content || '').replace(/@\{uin:\d+,nick:[^,]*,who:\d+,auto:\d+\}\s*/g, '').trim()
        if (!clean) continue
        pending.push({ postTid: String(post.tid), ctid, nick: String(r.name || r.uin || '有人'), content: clean.slice(0, 80), replyUin: String(r.uin || ''), replyNick: String(r.name || '') })
      }
      if (!ctid || seenSet.has(key)) continue
      if (String(c.uin || '') === String(uin)) { seenSet.add(key); continue }
      seenSet.add(key)
      pending.push({ postTid: String(post.tid), ctid, nick: String(c.nickname || c.uin || '有人'), content: String(c.content || '').slice(0, 80) })
    }
  }
  return { pending, seen: [...seenSet].slice(-500) }
}

export function qzoneCommentPrompt(pending) {
  const lines = pending.map((x, i) => (i + 1) + '. 说说 tid=' + x.postTid + '　评论 tid=' + x.ctid + '　来自「' + x.nick + '」' + (x.replyUin ? '　回复者 uin=' + x.replyUin : '') + '：' + x.content)
  return '【系统】你的空间收到了 ' + pending.length + ' 条新评论：\n' + lines.join('\n')
    + '\n请分别用 qq_qzone_reply_comment 回复（楼中楼要带 reply_uin/reply_nick，comment_tid 用上面给的评论 tid），每条一句话、自然点。'
    + '\n【只做这件事】可以顺带接上一条消息，但更早的未回复消息不要补答；不要向主人汇报“回完了”，不要在 QQ 里提这条系统提醒。'
}
