// The renderer supplies identities only. The host resolves scope and configuration permission.
const { randomUUID } = require('node:crypto')

module.exports.createPluginConnectionMethods = (ClientError) => ({
  async pluginConnection(input) {
    const generation = this.generation
    const organizationId = this.profile?.organizationId
    const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value)
    if (
      !id(input?.assistantId) ||
      !id(input?.bindingId) ||
      !this.profile?.organizationId ||
      !this.bots.some((bot) => (bot.assistantId || bot.id) === input.assistantId)
    )
      throw new ClientError('Select a digital expert in the current organization first.', 403)
    const options = await this.request(
      `/api/ai/assistants/${encodeURIComponent(input.assistantId)}/connectors?includeWorkspace=true`,
      { scope: 'organization' }
    )
    if (generation !== this.generation || organizationId !== this.profile?.organizationId)
      throw new ClientError('The workspace changed. Please retry.', 409)
    const binding = options.items?.find((item) => item.bindingId === input.bindingId)
    const scope = binding?.scope ?? options.scope
    const workspace = options.workspaceScope ?? options.scope
    if (
      !binding ||
      scope?.type !== 'workspace' ||
      workspace?.type !== 'workspace' ||
      scope.workspaceId !== workspace.workspaceId
    )
      throw new ClientError('This workspace connection is not available.', 403)
    const connected = binding.authorizationMode === 'shared' && binding.status === 'active' && binding.granted === true
    if (!connected && (!options.canManageWorkspace || !binding.canManage))
      throw new ClientError('Contact your workspace administrator to connect this service.', 403)
    return {
      connected,
      target: {
        target: 'workspace.connector.connect',
        assistantId: input.assistantId,
        bindingId: binding.bindingId,
        organizationId
      }
    }
  },
  async startPluginConnection(input) {
    // One bounded attempt per Desktop session; a newer attempt invalidates every older completion.
    this.pluginConnectionAttempt = null
    const startId = randomUUID()
    const generation = this.generation
    this.pluginConnectionStartId = startId
    const result = await this.pluginConnection(input)
    if (this.pluginConnectionStartId !== startId || generation !== this.generation)
      throw new ClientError('The workspace changed. Please retry.', 409)
    if (result.connected) return { status: 'connected' }
    const attempt = {
      id: randomUUID(),
      generation: this.generation,
      organizationId: result.target.organizationId,
      request: { assistantId: result.target.assistantId, bindingId: result.target.bindingId },
      expiresAt: Date.now() + 10 * 60 * 1000
    }
    this.pluginConnectionAttempt = attempt
    return { status: 'pending', attemptId: attempt.id, target: result.target }
  },
  async checkPluginConnection(input) {
    const attempt = this.pluginConnectionAttempt
    if (
      !attempt ||
      attempt.id !== input?.attemptId ||
      attempt.generation !== this.generation ||
      attempt.organizationId !== this.profile?.organizationId
    )
      throw new ClientError('The workspace changed. Please retry.', 409)
    if (Date.now() >= attempt.expiresAt) {
      this.pluginConnectionAttempt = null
      throw new ClientError('Connection timed out. Try connecting again.', 408)
    }
    const result = await this.pluginConnection(attempt.request)
    if (this.pluginConnectionAttempt !== attempt || Date.now() >= attempt.expiresAt)
      throw new ClientError('The workspace changed. Please retry.', 409)
    if (!result.connected) return { status: 'pending' }
    this.pluginConnectionAttempt = null
    return { status: 'connected' }
  },
  async cancelPluginConnection(input) {
    if (this.pluginConnectionAttempt?.id === input?.attemptId) this.pluginConnectionAttempt = null
    return { status: 'cancelled' }
  }
})
