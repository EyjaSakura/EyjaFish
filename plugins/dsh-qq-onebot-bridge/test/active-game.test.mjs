import test from 'node:test'
import assert from 'node:assert/strict'
import { handleActiveGame } from '../lib/services/active-game.js'

function harness(game, text) {
  const replies = []
  const games = new Map([['g:9', game]])
  const deps = {
    message: { senderName: 'A' },
    text,
    games,
    routeKey: 'g:9',
    safeReply: async (_m, t) => replies.push(t),
  }
  return { deps, replies, games }
}

test('无游戏 / 空文本返回 false', async () => {
  assert.equal(await handleActiveGame({ games: new Map(), routeKey: 'g:9', message: {}, text: 'x', safeReply: async () => {} }), false)
  const { deps } = harness({ kind: 'idiom' }, '   ')
  assert.equal(await handleActiveGame(deps), false)
})

test('成语接龙：未激活删除并返回 false', async () => {
  const { deps, games } = harness({ kind: 'idiom', chain: { active: false } }, '一心一意')
  assert.equal(await handleActiveGame(deps), false)
  assert.equal(games.size, 0)
})

test('成语接龙：接上 / 最后一棒 / 超时 / 答错', async () => {
  const next = harness({ kind: 'idiom', chain: { active: true, tryAnswer: () => ({ ok: true, next: '意气风发' }) } }, '一心一意')
  assert.equal(await handleActiveGame(next.deps), true)
  assert.match(next.replies[0], /意气风发/)

  const last = harness({ kind: 'idiom', chain: { active: true, tryAnswer: () => ({ ok: true, next: '' }) } }, '一心一意')
  assert.equal(await handleActiveGame(last.deps), true)
  assert.equal(last.games.size, 0)
  assert.match(last.replies[0], /你赢/)

  const timeout = harness({ kind: 'idiom', chain: { active: true, tryAnswer: () => ({ ok: false, reason: '超时' }) } }, '一心一意')
  assert.equal(await handleActiveGame(timeout.deps), true)
  assert.equal(timeout.games.size, 0)

  const wrong = harness({ kind: 'idiom', chain: { active: true, tryAnswer: () => ({ ok: false, reason: '不是成语' }) } }, '一心一意')
  assert.equal(await handleActiveGame(wrong.deps), true)
  assert.match(wrong.replies[0], /不是成语/)

  const chat = harness({ kind: 'idiom', chain: { active: true, tryAnswer: () => ({ ok: false, reason: '不是成语' }) } }, '随便聊聊呀')
  assert.equal(await handleActiveGame(chat.deps), false)
})

test('猜数字：正确 / 太大 / 太小 / 次数用完 / 无提示', async () => {
  const cases = [
    [{ hint: 'correct', answer: 42, tries: 3 }, /猜对/, true],
    [{ hint: 'bigger', tries: 2 }, /太小/, true],
    [{ hint: 'smaller', tries: 2 }, /太大/, true],
    [{ hint: 'exhausted', exhausted: true, answer: 42 }, /次数用完/, true],
    [{ hint: 'none' }, /./, false],
  ]
  for (const [result, re, expected] of cases) {
    const { deps, replies } = harness({ kind: 'guess', guess: { guess: () => result } }, '10')
    assert.equal(await handleActiveGame(deps), expected)
    if (expected) assert.match(replies[0], re)
  }
})
