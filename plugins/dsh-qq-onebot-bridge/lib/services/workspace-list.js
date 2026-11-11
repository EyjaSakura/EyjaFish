// 工作区列表文案 + 会话写锁探测。
import { execFile } from 'node:child_process'
import { join } from 'node:path'

export function formatWorkspaceList({ list, binding, sessionsOf }) {
  const lines = ['可切换的工作区：']
  list.forEach((ws, index) => {
    const sessions = sessionsOf(ws)
    const latest = sessions[0]
    const current = binding && binding.path === ws.path ? ' ←当前' : ''
    lines.push(`${index + 1}. ${ws.title}${current}（${sessions.length} 条会话${latest ? `，最新 ${latest.id.slice(0, 8)}` : ''}）`)
  })
  lines.push('用 /ws <序号或名字> 切换 · /ws off 退出')
  return lines.join('\n')
}

export function workspaceSessionBusy({ dir, exists, run = execFile }) {
  if (dir === '') return Promise.resolve(false)
  const lock = join(dir, 'session.lock')
  if (!exists(lock)) return Promise.resolve(false)
  return new Promise((resolve) => {
    run('flock', ['-n', '-E', '9', lock, '-c', 'true'], { timeout: 3000 }, (error) => {
      if (!error) return resolve(false)
      const busy = error.code === 9 || /\bexit code 9\b|status 9/.test(String(error.message))
      resolve(busy)
    })
  })
}
