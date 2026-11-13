const { localizedText } = require('./i18n/index.mjs')

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
function resourceId(value, ClientError) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new ClientError('Invalid input.', 400)
  return value
}

function workspacePath(service, input, ClientError) {
  if (!service.profile?.organizationId || input?.organizationId !== service.profile.organizationId)
    throw new ClientError('The organization changed. Select an assistant again.', 409)
  return resourceId(input.workspaceId, ClientError)
}

function createWorkspaceCatalogMethods(ClientError) {
  return {
    async skillCatalog(input) {
      if (!this.profile?.organizationId || this.profile.organizationId !== input?.organizationId)
        throw new ClientError('Select an organization first.', 403)
      const workspaceId = input.workspaceId && workspacePath(this, input, ClientError)
      const offset = input.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0 || typeof input.search !== 'string')
        throw new ClientError('Invalid input.', 400)
      const query = new URLSearchParams({ search: input.search, data: JSON.stringify({ skip: offset, take: 36 }) })
      const generation = this.generation
      const page = await this.request('/api/skill-repository-indexes?' + query, { scope: 'organization' })
      if (!Array.isArray(page?.items) || !Number.isSafeInteger(page.total))
        throw new ClientError('Invalid catalog response.', 502)
      if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
      const pageIds = page.items.map((item) => resourceId(item.id, ClientError))
      const installedQuery = new URLSearchParams({
        data: JSON.stringify({
          select: ['id', 'skillIndexId'],
          where: { skillIndexId: { $in: pageIds } },
          take: pageIds.length
        })
      })
      const installed =
        workspaceId && pageIds.length
          ? await this.request('/api/skill-package/by-workspace/' + workspaceId + '?' + installedQuery, {
              scope: 'organization'
            })
          : { items: [] }
      if (!Array.isArray(installed?.items)) throw new ClientError('Invalid catalog response.', 502)
      const ids = new Set(installed.items.map((item) => item.skillIndexId))
      const text = (value) => localizedText(value, this.config.locale)
      return {
        total: page.total,
        items: page.items.map((item) => ({
          id: resourceId(item.id, ClientError),
          name: text(item.name) || item.skillId,
          description: text(item.description),
          publisher: text(item.publisher?.displayName || item.repository?.name),
          installed: workspaceId ? ids.has(item.id) : null
        }))
      }
    },
    async installWorkspaceSkill(input) {
      const workspaceId = workspacePath(this, input, ClientError)
      const indexId = resourceId(input.indexId, ClientError)
      const installed = await this.request('/api/skill-package/workspace/' + workspaceId + '/install', {
        scope: 'organization',
        method: 'POST',
        retry: false,
        body: { indexId },
        includeServerMessage: true
      })
      if (!installed?.id || installed.workspaceId !== workspaceId || installed.skillIndexId !== indexId)
        throw new ClientError('Invalid installation response.', 502)
      return { installed: true }
    }
  }
}
module.exports = { createWorkspaceCatalogMethods }
