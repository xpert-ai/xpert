// Only known assistants and provider-owned account selectors can be addressed by the renderer.
const { localizedText } = require('./i18n/index.mjs')
const enc = encodeURIComponent
/** @type {Record<import('@xpert-ai/contracts').TIntegrationQrErrorCode, string>} */
const qrErrorMessages = {
  INTEGRATION_QR_BUSY: 'QR authorization is already starting. Please retry in a moment.',
  TRIGGER_DRAFT_CONFLICT:
    'This channel has unpublished changes. Publish or reset its trigger settings in Xpert before connecting.',
  TRIGGER_PUBLISH_REQUIRED: 'Publish this assistant in Xpert before connecting a channel.'
}
module.exports.createAssistantTriggerMethods = (ClientError) => {
  function context(service, input) {
    const bot = service.bots.find((item) => item.id === input?.botId)
    if (!service.profile?.organizationId || !bot)
      throw new ClientError('Select a Bot in the current workspace first.', 403)
    const generation = service.generation
    const organization = service.profile.organizationId
    return {
      path: `/api/xpert/${enc(bot.assistantId || bot.id)}`,
      assert() {
        if (generation !== service.generation || organization !== service.profile?.organizationId)
          throw new ClientError('The workspace changed. Please retry.', 409)
      }
    }
  }
  async function settings(service, ctx) {
    let value
    try {
      value = await service.request(`${ctx.path}/trigger-settings`, { scope: 'organization' })
    } catch (error) {
      if (error.status === 404) throw new ClientError('Trigger settings are unavailable on this server.', 404)
      throw error
    }
    ctx.assert()
    if (!value || typeof value.revision !== 'string' || !Array.isArray(value.providers) || !Array.isArray(value.items))
      throw new ClientError('Invalid service response. Check the API URL.', 502)
    return value
  }
  async function mutate(service, input, validate) {
    const ctx = context(service, input)
    const change = input?.change
    if (!change || typeof change !== 'object' || JSON.stringify(change).length > 14500)
      throw new ClientError('Invalid trigger configuration.')
    ctx.assert()
    try {
      const result = await service.request(`${ctx.path}/trigger-settings${validate ? '/validate' : ''}`, {
        method: 'POST',
        scope: 'organization',
        retry: false,
        body: change
      })
      ctx.assert()
      return result
    } catch (error) {
      if (error.status === 409) throw new ClientError('This trigger changed. Reload before saving again.', 409)
      if (error.status === 404) throw new ClientError('Trigger settings are unavailable on this server.', 404)
      throw error
    }
  }
  async function qrRequest(service, input, action) {
    const ctx = context(service, input)
    if (typeof input.provider !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.provider))
      throw new ClientError('Invalid channel provider.')
    if (action !== 'begin' && (typeof input.session !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.session)))
      throw new ClientError('Invalid QR session.')
    if (action === 'begin') {
      const data = await settings(service, ctx)
      if (!data.canEdit || data.providers.find((p) => p.name === input.provider)?.quickConnect?.method !== 'qr')
        throw new ClientError('QR connection is unavailable for this channel.', 403)
    }
    const path =
      `${ctx.path}/trigger-connections/${enc(input.provider)}/qr` +
      (action === 'begin' ? '' : `/${enc(input.session)}`) +
      (action === 'complete' ? '/complete' : '')
    const result = await service.request(path, {
      method: action === 'poll' ? 'GET' : action === 'cancel' ? 'DELETE' : 'POST',
      scope: 'organization',
      retry: false,
      errorMessages: qrErrorMessages
    })
    ctx.assert()
    if (action === 'cancel') return
    if (action === 'begin') {
      if (
        typeof result?.id !== 'string' ||
        !/^https:\/\//.test(result.authorizationUrl) ||
        !Number.isFinite(result.expiresAt) ||
        !Number.isFinite(result.intervalSeconds)
      )
        throw new ClientError('Invalid QR session response.', 502)
      return {
        id: result.id,
        authorizationUrl: result.authorizationUrl,
        expiresAt: result.expiresAt,
        intervalSeconds: Math.max(2, result.intervalSeconds)
      }
    }
    if (action === 'poll') {
      if (!['waiting', 'authorized', 'expired', 'denied', 'failed'].includes(result?.status))
        throw new ClientError('Invalid QR session response.', 502)
      return { status: result.status }
    }
    if (
      typeof result?.connected !== 'boolean' ||
      !['disconnected', 'connecting', 'connected', 'failed'].includes(result.state)
    )
      throw new ClientError('Invalid channel connection response.', 502)
    return { provider: input.provider, enabled: !!result.enabled, connected: result.connected, state: result.state }
  }
  return {
    beginAssistantTriggerQr(input) {
      return qrRequest(this, input, 'begin')
    },
    pollAssistantTriggerQr(input) {
      return qrRequest(this, input, 'poll')
    },
    completeAssistantTriggerQr(input) {
      return qrRequest(this, input, 'complete')
    },
    cancelAssistantTriggerQr(input) {
      return qrRequest(this, input, 'cancel')
    },
    assistantTriggers(input) {
      return settings(this, context(this, input))
    },
    saveAssistantTrigger(input) {
      return mutate(this, input, false)
    },
    validateAssistantTrigger(input) {
      return mutate(this, input, true)
    },
    async assistantTriggerOptions(input) {
      const ctx = context(this, input)
      const data = await settings(this, ctx)
      const provider = data.providers.find((item) => item.name === input.provider)
      const field = provider?.schema?.properties?.[input.field]
      const source = field?.['x-ui']?.selectUrl
      if (typeof source !== 'string') return []
      const url = new URL(source, 'https://xpert.invalid')
      if (
        url.origin !== 'https://xpert.invalid' ||
        !['/api/integration/select-options', '/api/connector/select-options'].includes(url.pathname)
      )
        throw new ClientError('Manage this configuration in Xpert.', 422)
      const profile = await this.request(`${ctx.path}/profile`, { scope: 'organization' })
      ctx.assert()
      if (!profile?.workspace?.id) throw new ClientError('This workspace connection is not available.', 403)
      url.searchParams.set('workspaceId', profile.workspace.id)
      const options = await this.request(`${url.pathname}${url.search}`, { scope: 'organization' })
      ctx.assert()
      if (!Array.isArray(options)) throw new ClientError('Invalid service response. Check the API URL.', 502)
      return options
        .filter((item) => typeof item?.value === 'string')
        .map((item) => ({
          value: item.value,
          label: localizedText(item.label, this.config.locale) || item.value,
          disabled: item.status !== undefined && item.status !== 'active'
        }))
    },
    async assistantTriggerManageUrl(input) {
      const ctx = context(this, input)
      await settings(this, ctx)
      return { url: `${this.config.webUrl}/settings/integration` }
    }
  }
}
