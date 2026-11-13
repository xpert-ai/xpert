// Installation targets the active organization; the inventory may also contain inherited tenant plugins.
const { MAX_PLUGIN_ZIP_BYTES } = require('./plugin-archive.mjs')
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

function installationOrganization(service, input, ClientError) {
  const organizationId = service.profile?.organizationId
  if (!organizationId || organizationId !== input?.organizationId)
    throw new ClientError('The organization changed. Select an assistant again.', 409)
  return organizationId
}

async function importPackage(service, organizationId, source, body, ClientError) {
  const installed = await service.request('/api/agent-plugins/' + source, {
    scope: 'organization',
    method: 'POST',
    timeout: 180000,
    retry: false,
    includeServerMessage: true,
    body
  })
  if (!installed?.id || installed.organizationId !== organizationId || typeof installed.descriptor?.name !== 'string')
    throw new ClientError('Invalid installation response.', 502)
  return { name: installed.descriptor.name, existing: installed.importStatus === 'existing' }
}

module.exports.createPluginLibraryMethods = (ClientError) => ({
  async organizationPluginAccess(organizationId) {
    if (!organizationId || organizationId !== this.profile?.organizationId) return false
    try {
      // Import status and Git installation share the same server-side admin guard.
      // HEAD checks access without downloading the organization's import history.
      await this.request('/api/agent-plugins/defaults', { method: 'HEAD', scope: 'organization', responseType: 'text' })
      return this.profile?.organizationId === organizationId
    } catch (error) {
      if (error.status === 403) return false
      throw error
    }
  },
  async installOrganizationPlugin(input) {
    const organizationId = installationOrganization(this, input, ClientError)
    if (
      typeof input.url !== 'string' ||
      typeof input.ref !== 'string' ||
      !input.ref.trim() ||
      (input.subdirectory !== undefined && typeof input.subdirectory !== 'string')
    )
      throw new ClientError('Invalid input.', 400)
    const body = { url: input.url.trim(), ref: input.ref.trim(), subdirectory: input.subdirectory?.trim() || '.' }
    return importPackage(this, organizationId, 'git', body, ClientError)
  },
  async installOrganizationPluginZip(input) {
    const organizationId = installationOrganization(this, input, ClientError)
    const bytes = input.bytes
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength)
      throw new ClientError('Choose a non-empty ZIP plugin package.', 400)
    if (bytes.byteLength > MAX_PLUGIN_ZIP_BYTES)
      throw new ClientError('The ZIP package exceeds the 100 MiB limit.', 413)
    const body = new FormData()
    body.append('file', new Blob([bytes], { type: 'application/zip' }), 'plugin.zip')
    return importPackage(this, organizationId, 'zip', body, ClientError)
  },
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
