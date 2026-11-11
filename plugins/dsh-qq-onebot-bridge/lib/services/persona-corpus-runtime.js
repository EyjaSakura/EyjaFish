// Persona + corpus prompt sections. Kept out of bridge.js so prompt assembly
// can be tested and changed without growing the bridge.
import { corpusSectionText, resolveCorpusDetailed } from '../corpus.js'
import { resolvePersona as resolvePersonaService } from './persona.js'
import { pathOf } from '../paths.js'
import { debugLog } from '../core/debug-log.js'

export function createPersonaCorpusRuntime({ config, logger, personaFileCache, getAclPolicy, defaultPersona }) {
  function personaEnabled() {
    const raw = config.persona
    return !(raw && typeof raw === 'object' && raw.enabled === false)
  }

  function resolvePersona(role, key) {
    return resolvePersonaService({ config, role, key, cache: personaFileCache, fallback: defaultPersona })
  }

  function registerPersonaSection(agentCtx, key, role) {
    if (!agentCtx?.systemPrompt?.section) return
    let order = 0.5
    try {
      const base = agentCtx.systemPrompt.getSectionOrder?.('DEPLOYMENT_PERSONA_PREFIX')
      if (Number.isFinite(base)) order = base + 0.5
    } catch { /* 取不到就用兜底顺序 */ }
    try {
      agentCtx.systemPrompt.section({
        name: 'qq-persona',
        order,
        text: () => resolvePersona(role, key).text,
      })
      const probe = resolvePersona(role, key)
      debugLog(`persona ${key} (role=${role?.id ?? '?'}): source=${probe.source} bytes=${Buffer.byteLength(probe.text, 'utf8')}`)
    } catch (error) {
      logger.warn(`[本地补丁 persona] 注册人格段失败（{key}）：${error?.message ?? error}`)
      debugLog(`persona ${key}: register failed: ${error?.stack ?? error}`)
    }
  }

  function resolveCorpusFor(subject) {
    try {
      return resolveCorpusDetailed({
        policy: getAclPolicy(),
        subjectId: subject,
        root: pathOf(config, 'corpora'),
      })
    } catch (error) {
      debugLog(`corpus resolve failed subject=${subject}: ${error?.message ?? error}`)
      return { items: [], skipped: [], bound: [] }
    }
  }

  function registerCorpusSection(agentCtx, key, subject) {
    if (!agentCtx?.systemPrompt?.section) return
    let bound = []
    try { bound = getAclPolicy()?.corpusBindings?.[subject] ?? [] } catch { bound = [] }
    if (!Array.isArray(bound) || bound.length === 0) return
    try {
      let order = 0.6
      try {
        const base = agentCtx.systemPrompt.getSectionOrder?.('qq-persona')
        if (Number.isFinite(base)) order = base + 0.1
      } catch { /* 取不到就用兜底顺序 */ }
      agentCtx.systemPrompt.section({
        name: 'qq-corpus',
        order,
        text: () => corpusSectionText(resolveCorpusFor(subject).items),
      })
      const probe = resolveCorpusFor(subject)
      debugLog(`corpus ${key} (subject=${subject}): 注入 ${probe.items.length} 段，跳过 ${probe.skipped.length} 段`
        + `${probe.skipped.length ? '（' + probe.skipped.map((x) => `${x.id}:${x.reason}`).join('；') + '）' : ''}`)
    } catch (error) {
      logger.warn(`[权限模型] 注册语料段失败（${key}）：${error?.message ?? error}`)
    }
  }

  return { personaEnabled, resolvePersona, registerPersonaSection, registerCorpusSection, resolveCorpusFor }
}
