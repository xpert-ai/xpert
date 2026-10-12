// Read-only installation catalog. Scope comes from the authenticated host session.
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

module.exports.createPluginLibraryMethods = (ClientError) => ({
  async pluginLibrary() {
    if (!this.profile) throw new ClientError('Sign in first.', 401)
    const generation = this.generation
    const data = await this.request('/api/agent-plugins/catalog', {
      scope: this.profile.organizationId ? 'organization' : 'tenant'
    })
    if (!Array.isArray(data.items)) throw new ClientError('Invalid catalog response.', 502)
    if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
    const text = (value) => localizedText(value, this.config.locale)
    return {
      items: data.items
        .map((item) => ({
          id: item.id,
          name: text(item.name),
          description: text(item.description),
          icon: pluginIcon(item.icon, this.config.webUrl),
          version: item.version,
          scope: item.scope,
          status: item.status,
          components: item.components.map(({ kind, name }) => ({ kind, name }))
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    }
  }
})
