// /画：提示词裁剪、冷却/日限、生图、落盘并发送。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** @param {any} args */
export async function handleImageGen({
  message,
  prompt,
  config = {},
  chatLimits,
  genLastAt,
  genDaily,
  generateImage,
  imageDir,
  sendImageBuffer,
  safeReply,
  debugLog = () => {},
  now = Date.now(),
}) {
  const genCmd = String(config.imageGenCommand || '/画').trim()
  if (!prompt) {
    await safeReply(message, `用法：${genCmd} 描述词\n例如：${genCmd} 一只蓝鲸在星空下喷着水花，赛博朋克风格`)
    return
  }
  const maxChars = Math.min(1000, Math.max(10, Number(config.imageGenMaxPromptChars) || 400))
  if (prompt.length > maxChars) prompt = prompt.slice(0, maxChars)
  const key = message.messageType === 'group' ? `g:${message.groupId}` : `u:${message.userId}`
  const limits = chatLimits(message, ['imageGenCooldownSeconds', 'imageGenDailyLimit', 'imageGenMaxPromptChars'])
  const cooldown = Math.max(10, Number(limits.imageGenCooldownSeconds ?? config.imageGenCooldownSeconds) || 60) * 1000
  const since = now - (genLastAt.get(key) ?? 0)
  if (since < cooldown) {
    await safeReply(message, `画得太快啦～小鲸鱼要喘口气，再等 ${Math.ceil((cooldown - since) / 1000)} 秒吧`)
    return
  }
  const today = new Date(now).toDateString()
  const daily = genDaily.get(key)
  const dailyLimit = Math.max(1, Number(limits.imageGenDailyLimit ?? config.imageGenDailyLimit) || 20)
  if (daily && daily.date === today && daily.count >= dailyLimit) {
    await safeReply(message, '今天画得够多啦，明天再来吧～')
    return
  }
  genLastAt.set(key, now)
  genDaily.set(key, daily && daily.date === today ? { date: today, count: daily.count + 1 } : { date: today, count: 1 })
  await safeReply(message, '🎨 正在努力作画，稍等十几秒哦～')
  try {
    const { buffer } = await generateImage(config, prompt)
    if (!buffer || buffer.length === 0) throw new Error('生成结果为空')
    mkdirSync(imageDir, { recursive: true })
    const file = join(imageDir, `gen-${now.toString(36)}.png`)
    writeFileSync(file, buffer)
    await sendImageBuffer({ bot: message.bot, messageType: message.messageType, targetId: message.messageType === 'group' ? message.groupId : message.userId }, buffer)
    debugLog(`image gen sent (${buffer.length} bytes)`)
  } catch (error) {
    debugLog(`image gen failed: ${error.message}`)
    await safeReply(message, `生图失败：${error.message.slice(0, 60)}`)
  }
}
