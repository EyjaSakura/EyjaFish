// Text @-mention detection and bot-name learning.
import { mentionsByName, stripMentionName } from '../onebot.js'
import { learnBotNames as learnBotNamesService } from './bot-names.js'
import { debugLog } from '../core/debug-log.js'

export async function textMentionName({ bridge, message }) {
  const text = String(message.text ?? '')
  if (!text.includes('@')) return ''
  let hit = mentionsByName(text, bridge.botNames)
  if (hit === '' && bridge.botNamesLearned !== true) {
    await learnBotNames({ bridge })
    hit = mentionsByName(text, bridge.botNames)
  }
  if (hit !== '') message.text = stripMentionName(text, hit)
  return hit
}

export async function learnBotNames({ bridge }) {
  if (bridge.botNamesLearned === true) return
  if (bridge.botNameLearnPromise) return bridge.botNameLearnPromise
  bridge.botNameLearnPromise = (async () => {
    const result = await learnBotNamesService({ server: bridge.server, config: bridge.config, debugLog })
    if (!result) return
    for (const name of result.names) bridge.botNames.add(name)
    bridge.botNamesLearned = true
    bridge.botNameLearnFailed = result.failed
    if (result.names.length > 0) {
      bridge.trace?.event({
        id: '', stage: 'mention', ok: true,
        reason: `已记住机器人名：${result.names.join(' / ')}（这些名字出现在正文里也算 @）`,
      })
    }
  })()
  return bridge.botNameLearnPromise
}

export function mentionLearnHint({ bridge }) {
  return bridge.botNameLearnFailed === true
    ? '；也没学到机器人昵称/群名片（可用 mentionAliases 手填别名，文本 @ 才认得出）'
    : ''
}
