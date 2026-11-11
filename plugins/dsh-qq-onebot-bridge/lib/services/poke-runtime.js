// Poke reply.
import { handlePoke as handlePokeService } from './poke-command.js'
import { pickPokeText } from './poke-policy.js'
import { planPoke } from '../engage.js'
import { debugLog } from '../core/debug-log.js'

export async function handlePoke({ bridge, notice }) {
  return handlePokeService({
    notice,
    config: bridge.config,
    lastPokeAt: bridge.lastPokeAt,
    planPoke,
    pickPokeText,
    engageOn: (name) => bridge.engageOn(name),
    engageWriteBlocked: (m) => bridge.engageWriteBlocked(m),
    engageBlockedReason: (what) => bridge.engageBlockedReason(what),
    pokeQuota: bridge.pokeQuota,
    gate: bridge.gate,
    server: bridge.server,
    saveEngageState: () => bridge.saveEngageState(),
    debugLog,
  })
}
