// Invariants: delivery stays on the authenticated requesting View and its original plugin.
// Callbacks are at-least-once; acknowledgements are persisted before audio is removed.
const { hash, uuid } = require('./cache.cjs')
class CaptureDelivery {
  constructor(service) {
    this.service = service
  }
  scope(input) {
    const service = this.service
    const bot = service.bots.find((item) => item.id === input?.botId)
    const scope = {
      apiUrl: service.config.apiUrl,
      tenantId: service.credentials?.tenantId,
      organizationId: service.profile?.organizationId,
      userId: service.profile?.user?.id,
      assistantId: input?.hostId,
      viewKey: input?.viewKey
    }
    if (
      !bot ||
      !uuid(scope.assistantId) ||
      !scope.tenantId ||
      !scope.organizationId ||
      !scope.userId ||
      (bot.assistantId || bot.id) !== scope.assistantId
    )
      throw new Error('scope_changed')
    if (typeof scope.viewKey !== 'string' || !/^[a-zA-Z0-9._:-]{1,200}$/.test(scope.viewKey))
      throw new Error('invalid_input')
    return scope
  }
  assertCurrent(record) {
    const scope = this.scope({ botId: record.botId, hostId: record.scope.assistantId, viewKey: record.scope.viewKey })
    if (JSON.stringify(record.scope) !== JSON.stringify(scope)) throw new Error('scope_changed')
  }
  route(record) {
    return `/api/view-hosts/agent/${encodeURIComponent(record.scope.assistantId)}/views/${encodeURIComponent(record.scope.viewKey)}`
  }
  async authorize(record, commandKey) {
    this.assertCurrent(record)
    const manifest = await this.service.request(`${this.route(record)}/manifest`, { scope: 'organization' })
    this.assertCurrent(record)
    const plugin = manifest?.source?.plugin
    if (
      typeof plugin !== 'string' ||
      !plugin ||
      (record.plugin && record.plugin !== plugin) ||
      !manifest.clientCommands?.some((item) => item.key === commandKey) ||
      !manifest.actions?.some(
        (item) => item.key === record.delivery.eventAction && item.actionType === 'invoke' && item.transport !== 'file'
      ) ||
      !manifest.actions?.some(
        (item) => item.key === record.delivery.chunkAction && item.actionType === 'invoke' && item.transport === 'file'
      )
    )
      throw new Error('forbidden')
    record.plugin = plugin
  }
  async action(record, key, input, bytes) {
    this.assertCurrent(record)
    let body = { input }
    if (bytes) {
      body = new FormData()
      body.set('input', JSON.stringify(input))
      body.set('file', new Blob([bytes], { type: 'audio/wav' }), 'audio.wav')
    }
    const result = await this.service.request(
      `${this.route(record)}/actions/${encodeURIComponent(key)}${bytes ? '/file' : ''}`,
      { method: 'POST', body, scope: 'organization' }
    )
    this.assertCurrent(record)
    if (result?.success !== true) throw new Error('delivery_pending')
  }
  metadata(record) {
    return {
      version: 1,
      captureId: record.id,
      ...(record.delivery.context !== undefined ? { context: record.delivery.context } : {})
    }
  }
  event(record, event, detail) {
    return this.action(record, record.delivery.eventAction, {
      ...this.metadata(record),
      eventId: `${record.id}:${event}`,
      event,
      ...detail
    })
  }
  chunk(record, chunk) {
    const bytes = Buffer.from(chunk.wav, 'base64')
    return this.action(
      record,
      record.delivery.chunkAction,
      {
        ...this.metadata(record),
        track: chunk.track,
        sequence: chunk.sequence,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        sha256: hash(bytes)
      },
      bytes
    )
  }
}
module.exports = { CaptureDelivery }
