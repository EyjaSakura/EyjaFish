// Optional external services: scheduled broadcaster and inbound webhook receiver.
import { JsonStore } from '../store.js'
import { Broadcaster } from '../broadcast.js'
import { WebhookReceiver } from '../webhook.js'
import { pathOf } from '../paths.js'
import { debugLog } from '../core/debug-log.js'

export function createExternalSetup({ config, logger, deliverExternal, saveBroadcastState, pingMc, formatFeed, onWebhookEvent }) {
  let broadcast = null
  let broadcastState = null
  if (config.broadcastEnabled === true && Array.isArray(config.broadcastJobs) && config.broadcastJobs.length > 0) {
    broadcastState = new JsonStore(
      config.broadcastStateFile || pathOf(config, 'broadcast'),
      { fallback: {} },
    )
    broadcast = new Broadcaster({
      jobs: config.broadcastJobs,
      send: async (chat, text) => {
        const sent = await deliverExternal(chat, text, '播报')
        saveBroadcastState()
        return sent
      },
      pingMc: (address) => pingMc(address),
      formatFeed: (xml, job) => formatFeed(xml, job),
      log: (level, message) => (level === 'error' ? logger.warn(message) : debugLog(message)),
    })
    try {
      broadcast.restore(broadcastState.read() ?? {})
    } catch (error) {
      debugLog(`broadcast state restore failed: ${error.message}`)
    }
  }

  let webhook = null
  if (config.webhookEnabled === true && Array.isArray(config.webhookSources) && config.webhookSources.length > 0) {
    webhook = new WebhookReceiver({
      host: '127.0.0.1',
      port: config.webhookPort,
      sources: config.webhookSources,
      ratePerMinute: config.webhookRatePerMinute,
      maxBodyBytes: config.webhookMaxBodyBytes,
      logger,
      onEvent: (event) => onWebhookEvent(event),
    })
  }

  return { broadcast, broadcastState, webhook }
}
