// Workspace writes use server-authorized editor endpoints. Renderer-supplied scopes and configurations are never forwarded.
const { localizedText } = require('./i18n/index.mjs')

function pluginIcon(value, webUrl) {
  if (typeof value !== 'string') return null
  const source = value.trim()
  if (/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[a-z\d+/]+={0,2}$/i.test(source)) return source
  if (!/^https?:\/\//i.test(source) && !/^\/(?![\/\\])/.test(source)) return null
  try {
    const url = new URL(source, webUrl)
    if (url.username || url.password) return null
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value)

module.exports.createPluginLibraryMethods = (ClientError) => ({
  async pluginLibrary(input) {
    if (!this.profile?.organizationId) throw new ClientError('Select an organization first.', 403)
    const generation = this.generation
    const options = await this.request('/api/agent-plugins/workspace-options', { scope: 'organization' })
    if (!Array.isArray(options.workspaces) || !Array.isArray(options.experts))
      throw new ClientError('Invalid catalog response.', 502)
    const workspaces = options.workspaces.map(({ id, name }) => ({ id, name }))
    const workspaceId = input?.workspaceId || workspaces[0]?.id || null
    if (workspaceId && (!validId(workspaceId) || !workspaces.some((item) => item.id === workspaceId)))
      throw new ClientError('You do not have edit access to this workspace.', 403)
    const data = workspaceId
      ? await this.request(`/api/agent-plugins/workspaces/${encodeURIComponent(workspaceId)}`, {
          scope: 'organization'
        })
      : { items: [] }
    if (!Array.isArray(data.items)) throw new ClientError('Invalid catalog response.', 502)
    if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
    const text = (value) => localizedText(value, this.config.locale)
    return {
      workspaceId,
      workspaces,
      experts: options.experts.map(({ id, name }) => ({ id, name })),
      items: data.items
        .map((item) => ({
          id: item.id,
          name: text(item.name),
          description: text(item.description),
          icon: pluginIcon(item.icon, this.config.webUrl),
          version: item.version,
          status: item.status,
          components: item.components.map(({ kind, name }) => ({ kind, name })),
          expertReferences: item.expertReferences
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    }
  },
  async addWorkspacePlugin(input) {
    if (!validId(input?.workspaceId) || !validId(input?.packageId))
      throw new ClientError('Invalid catalog response.', 400)
    const generation = this.generation
    const library = await this.pluginLibrary({ workspaceId: input.workspaceId })
    const item = library.items.find((item) => item.id === input.packageId)
    if (!item) throw new ClientError('The plugin changed. Refresh the catalog and retry.', 409)
    const experts = {}
    for (const reference of item.expertReferences) {
      const id = input.experts?.[reference]
      if (!validId(id) || !library.experts.some((expert) => expert.id === id))
        throw new ClientError('Choose a digital expert for each required role.', 400)
      experts[reference] = id
    }
    if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
    const result = await this.request(
      `/api/agent-plugins/workspaces/${encodeURIComponent(input.workspaceId)}/plugins`,
      {
        method: 'POST',
        scope: 'organization',
        timeout: 180000,
        body: { packageId: item.id, experts }
      }
    )
    return { status: result.status, bindingId: result.bindingId }
  }
})
