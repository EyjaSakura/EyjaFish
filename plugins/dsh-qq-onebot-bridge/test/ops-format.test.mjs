import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatShutList, formatGroupInfoEx, formatIgnoredNotifies, formatSignedList,
  formatPullResult, formatFileOp, formatAlbumMediaList, collectPendingRequests,
} from '../lib/ops.js'

test('formatShutList：空 / 到期 / 活跃', () => {
  assert.match(formatShutList([]), /没有被禁言/)
  const now = 1_000_000_000_000
  const active = formatShutList([{ user_id: 1, nickname: 'A', shut_up_time: (now + 600_000) / 1000 }], { now })
  assert.match(active, /禁言名单/)
  assert.match(active, /A/)
})

test('formatGroupInfoEx：空 / 有字段 / 时间', () => {
  assert.match(formatGroupInfoEx(null), /没有查到/)
  const text = formatGroupInfoEx({ groupName: 'G', memberCount: 3, createTime: 1760000000 })
  assert.match(text, /群名：G/)
  assert.match(text, /人数：3/)
})

test('formatIgnoredNotifies', () => {
  assert.match(formatIgnoredNotifies({}), /没有被忽略/)
  assert.match(formatIgnoredNotifies({ join_requests: [{ requester_uin: 1, requester_nick: 'A' }] }), /A/)
})

test('formatSignedList', () => {
  assert.match(formatSignedList(null), /没有返回数据/)
  assert.match(formatSignedList([]), /还没有人打卡/)
  const now = 1_000_000_000_000
  const text = formatSignedList([{ user_id: 1, nick: 'A', rank: 1.5, time: (now - 60_000) / 1000 }], { now })
  assert.match(text, /第 1 名/)
})

test('formatPullResult 各计数', () => {
  const text = formatPullResult({ adopted: [{ kind: 'doubt' }, { kind: 'invite' }, { kind: 'group' }], raw: 5, already: 1, full: 2, invalid: 3, failed: 4, pendingMax: 20 })
  assert.match(text, /入群申请 1/)
  assert.match(text, /入群邀请 1/)
  assert.match(text, /可疑好友 1/)
  assert.match(text, /队列已满/)
  assert.match(text, /只能同意/)
})

test('formatFileOp / formatAlbumMediaList', () => {
  assert.match(formatFileOp('move', { ok: false, reason: 'x' }), /移动失败/)
  assert.match(formatFileOp('move', { ok: true }, 'a -> b'), /已移动：a -> b/)
  assert.match(formatAlbumMediaList({}), /还没有照片/)
  assert.match(formatAlbumMediaList({ media_list: [{ media_id: '1', name: 'a.jpg' }] }), /a\.jpg/)
})

test('collectPendingRequests：join / invite / doubt / 去重 / checked', () => {
  const out = collectPendingRequests({
    groupId: 9,
    systemMsg: {
      join_requests: [
        { request_id: '1', requester_uin: 100, requester_nick: 'A', message: 'hi' },
        { request_id: '1', requester_uin: 100 },
        { request_id: '2', checked: true },
      ],
      invited_requests: [{ request_id: '3', invitor_uin: 200, invitor_nick: 'B' }],
    },
    doubts: [{ flag: 'uid1', uin: 300, nick: 'C', msg: 'suspicious' }],
  })
  assert.equal(out.length, 3)
  assert.equal(out[0].kind, 'group')
  assert.equal(out[1].kind, 'invite')
  assert.equal(out[2].kind, 'doubt')
  assert.equal(out[2].approveOnly, true)
})
