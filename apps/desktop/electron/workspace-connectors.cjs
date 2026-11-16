const { localizedText } = require('./i18n/index.mjs')
const { parseAvatarUrl } = require('./avatar-url.cjs')
const { resourceId, workspacePath } = require('./workspace-catalog.cjs')

const statuses = new Set(['active', 'pending', 'expired', 'error', 'disconnected'])
const localKeyMethod = (method) => method.type === 'api_key' && !method.credentials?.integration

module.exports.createWorkspaceConnectorMethods = (ClientError) => ({
  async workspaceConnectors(input) {
    const workspaceId = workspacePath(this, input, ClientError)
    const query = '?scopeType=workspace&scopeId=' + workspaceId
    const [definitions, bindings] = await Promise.all(
      ['definitions', 'bindings'].map((path) =>
        this.request('/api/connector/' + path + query, { scope: 'organization' })
      )
    )
    if (!Array.isArray(definitions) || !Array.isArray(bindings)) throw new ClientError('Invalid catalog response.', 502)
    const byProvider = new Map(
      bindings
        .filter((item) => item.scope?.type === 'workspace' && item.scope.workspaceId === workspaceId)
        .map((item) => [item.provider, item])
    )
    const text = (value) => localizedText(value, this.config.locale)
    return definitions
      .map((definition) => {
        const binding = byProvider.get(definition.provider)
        const methods = (definition.authMethods ?? []).filter((method) => !method.deprecated)
        const available =
          !definition.unavailable &&
          (!binding || binding.authorizationMode === 'shared') &&
          (definition.authorizationModes ?? ['shared']).includes('shared')
        return {
          provider: definition.provider,
          name: text(definition.label) || definition.provider,
          description: text(definition.description),
          icon: definition.icon?.type === 'image' ? parseAvatarUrl(definition.icon.value) : null,
          status: statuses.has(binding?.status) ? binding.status : 'disconnected',
          bindingId: binding?.id ?? null,
          available,
          hasWebMethods:
            methods.some((method) => !localKeyMethod(method)) ||
            (!definition.authMethods && definition.auth?.type === 'oauth2'),
          keyMethods: methods.filter(localKeyMethod).map((method) => ({
            id: method.id,
            label: text(method.label),
            fields: (method.credentials?.fields ?? []).map((field) => ({
              name: field.name,
              label: text(field.label) || field.name,
              required: field.required === true,
              secret: !!field.secret || field.type === 'password',
              initial:
                field.secret || field.type === 'password'
                  ? ''
                  : String(method.credentials.defaultValues?.[field.name] ?? '')
            }))
          }))
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  async connectWorkspaceApiKey(input) {
    const workspaceId = workspacePath(this, input, ClientError)
    if (
      typeof input.provider !== 'string' ||
      !input.provider ||
      ['.', '..'].includes(input.provider) ||
      typeof input.methodId !== 'string' ||
      !input.values ||
      typeof input.values !== 'object' ||
      Array.isArray(input.values) ||
      !Object.values(input.values).every((value) => typeof value === 'string')
    )
      throw new ClientError('Invalid input.', 400)
    const generation = this.generation
    const catalog = await this.workspaceConnectors(input)
    const item = catalog.find((item) => item.provider === input.provider && item.available)
    const method = item?.keyMethods.find((method) => method.id === input.methodId)
    if (!method || !Object.keys(input.values).every((key) => method.fields.some((field) => field.name === key)))
      throw new ClientError('Invalid input.', 400)
    if (generation !== this.generation || this.profile?.organizationId !== input.organizationId)
      throw new ClientError('The session changed. Please retry.', 409)
    // Use the workspace-qualified route so the server rechecks management permission on every write.
    const result = await this.request(
      '/api/connector/' + workspaceId + '/' + encodeURIComponent(input.provider) + '/connect',
      {
        scope: 'organization',
        method: 'POST',
        retry: false,
        body: { authMethodId: input.methodId, values: input.values }
      }
    )
    if (
      !result?.connector ||
      (result.connector.scope
        ? result.connector.scope.type !== 'workspace' || result.connector.scope.workspaceId !== workspaceId
        : result.connector.workspaceId !== workspaceId) ||
      result.connector.provider !== input.provider ||
      result.status !== 'active'
    )
      throw new ClientError('Connection failed', 502)
    return { connected: true }
  },
  async disconnectWorkspaceConnector(input) {
    const workspaceId = workspacePath(this, input, ClientError)
    const bindingId = resourceId(input.bindingId, ClientError)
    await this.request('/api/connector/' + workspaceId + '/' + bindingId, {
      scope: 'organization',
      method: 'DELETE',
      retry: false,
      responseType: 'text'
    })
  }
})
