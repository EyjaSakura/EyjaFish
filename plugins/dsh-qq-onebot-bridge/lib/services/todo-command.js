// 待办命令：/todo 查看、add 添加、done 完成、clear 清除已完成。
import { TodoStore } from '../grouptools.js'

export async function handleTodo({ message, arg, todoDir, routeKey, safeReply }) {
  const key = routeKey
  const store = new TodoStore(todoDir)
  if (arg === '' || arg === 'list') {
    const list = store.load(key)
    if (list.length === 0) {
      await safeReply(message, '待办清单是空的。用「/todo add xxx」或「记一下：xxx」添加。')
      return
    }
    const pending = list.filter((t) => !t.done)
    const done = list.filter((t) => t.done)
    const lines = []
    pending.forEach((t, i) => { lines.push(`${i + 1}. ${t.text}`) })
    const text = `待办清单（${pending.length} 件待完成）：\n${lines.length ? lines.join('\n') : '（全部完成 ✅）'}` + (done.length ? `\n已完成 ${done.length} 件（/todo clear 清除已完成）。` : '')
    await safeReply(message, text)
    return
  }
  if (arg.startsWith('add ')) {
    const item = arg.slice(4).trim()
    if (item === '') {
      await safeReply(message, '用法：/todo add 内容')
      return
    }
    const list = store.load(key)
    list.push({ id: `t${Date.now().toString(36)}`, text: item, done: false, ts: Date.now() })
    store.save(key, list)
    await safeReply(message, `✅ 已添加待办：${item}`)
    return
  }
  const doneMatch = /^done\s+(\d+)$/.exec(arg)
  if (doneMatch) {
    const idx = Number(doneMatch[1]) - 1
    const list = store.load(key)
    const pending = list.filter((t) => !t.done)
    if (idx < 0 || idx >= pending.length) {
      await safeReply(message, '⚠️ 序号无效（用 /todo 查看当前序号）。')
      return
    }
    pending[idx].done = true
    store.save(key, list)
    await safeReply(message, `✅ 已完成：${pending[idx].text}`)
    return
  }
  if (arg === 'clear') {
    const list = store.load(key).filter((t) => !t.done)
    store.save(key, list)
    await safeReply(message, '✅ 已清除已完成的待办。')
    return
  }
  await safeReply(message, '用法：/todo（查看）| /todo add xxx（添加）| /todo done 序号（完成）| /todo clear（清除已完成）')
}
