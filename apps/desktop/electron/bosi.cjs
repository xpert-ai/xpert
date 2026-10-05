// All identities and OAuth destinations stay scoped to the authenticated host.
module.exports.createBosiMethods = (ClientError) => {
  const capabilityKeys = ['cloud-computer', 'desktop-shell']
  function selection(input) {
    const keys = input?.capabilities ?? []
    if (!Array.isArray(keys) || keys.length > 2 || keys.some((key) => !capabilityKeys.includes(key)))
      throw new ClientError('Invalid assistant settings.')
    return [...new Set(keys)]
  }
  async function call(service, suffix, options) {
    if (!service.profile?.organizationId) throw new ClientError('Select an organization first.', 403)
    try {
      const generation = service.generation
      const organizationId = service.profile.organizationId
      const result = await service.request(`/api/assistant-binding/bosi/${suffix}`, {
        scope: 'organization',
        includeServerMessage: true,
        ...options
      })
      if (generation !== service.generation || organizationId !== service.profile?.organizationId)
        throw new ClientError('The workspace changed. Please retry.', 409)
      return result
    } catch (error) {
      if (error.status === 404 && /^Cannot (GET|POST) /.test(error.message || ''))
        throw new ClientError('Update the Xpert server to initialize Bosi.', 404)
      throw error
    }
  }
  return {
    async bosiOnboarding() {
      // Mount, focus and manual refresh may coincide. Reservation runs once per
      // authenticated scope; a stale response never joins the next organization.
      const current = this.bosiCatalogRequest
      if (current && current.generation === this.generation && current.organizationId === this.profile?.organizationId)
        return current.result
      const request = {
        generation: this.generation,
        organizationId: this.profile?.organizationId,
        result: call(this, 'onboarding', { method: 'POST', body: {}, retry: false })
      }
      this.bosiCatalogRequest = request
      try {
        return await request.result
      } finally {
        if (this.bosiCatalogRequest === request) this.bosiCatalogRequest = null
      }
    },
    bosiChoose(input) {
      return call(this, 'onboarding/choice', { method: 'POST', body: input, retry: false })
    },
    async bosiConnect(input) {
      const target = await call(this, 'onboarding/connection', { method: 'POST', body: input, retry: false })
      const attemptId = require('node:crypto').randomUUID()
      this.bosiConnectionAttempt = { attemptId, target, generation: this.generation, expiresAt: Date.now() + 600000 }
      return { attemptId, target: { target: 'bosi.connector.connect', ...target } }
    },
    async bosiCheckConnection(input) {
      const attempt = this.bosiConnectionAttempt
      if (
        !attempt ||
        attempt.attemptId !== input?.attemptId ||
        attempt.generation !== this.generation ||
        attempt.target.organizationId !== this.profile?.organizationId ||
        attempt.expiresAt < Date.now()
      )
        throw new ClientError('Connection timed out. Try connecting again.', 409)
      const result = await call(this, 'onboarding/connection/resolve', {
        method: 'POST',
        retry: false,
        body: { workspaceId: attempt.target.workspaceId, bindingId: attempt.target.bindingId }
      })
      if (this.bosiConnectionAttempt !== attempt) throw new ClientError('The workspace changed. Please retry.', 409)
      if (result.connected) this.bosiConnectionAttempt = null
      return { status: result.connected ? 'connected' : 'pending' }
    },
    bosiSetup(input) {
      return call(this, `setup?capabilities=${selection(input).join(',')}`)
    },
    bosiWorkspace() {
      return call(this, 'workspace', { method: 'POST', body: {}, retry: false })
    },
    async createBosi(input) {
      if (typeof input?.modelId !== 'string' || !input.modelId || input.modelId.length > 1000)
        throw new ClientError('Select a compatible model for this assistant.')
      return call(this, 'bootstrap', {
        method: 'POST',
        retry: false,
        timeout: 180000,
        body: { modelId: input.modelId, capabilities: selection(input) }
      })
    },
    bosiWelcome() {
      return call(this, 'welcome', { method: 'POST', body: {}, retry: false, timeout: 60000 })
    },
    async bosiConnections(input) {
      const workspace = await this.request('/api/xpert-workspace/my/default?purpose=authoring', {
        scope: 'organization'
      })
      if (!workspace?.id || workspace.id !== input?.workspaceId)
        throw new ClientError('The workspace changed. Please retry.', 409)
      const items = await this.request(
        `/api/connector/bindings?scopeType=workspace&scopeId=${encodeURIComponent(workspace.id)}`,
        { scope: 'organization' }
      )
      if (!Array.isArray(items)) throw new ClientError('Invalid service response. Check the API URL.', 502)
      return items.map(({ id, name, provider, status, authorizationMode }) => ({
        id,
        name: name || provider,
        connected: authorizationMode === 'shared' && status === 'active'
      }))
    }
  }
}
