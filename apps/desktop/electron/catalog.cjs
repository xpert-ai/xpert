const { localizedText } = require('./i18n/index.mjs')
// A narrow marketplace boundary: credentials, template DSL and plugin configuration stay in the host.
module.exports.createCatalogMethods = function createCatalogMethods(ClientError) {
  const text = (value) => (typeof value === 'string' ? value : '')
  const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
  const required = (value, label, max = 256) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
      throw new ClientError('Invalid {{label}}.', 400, { label })
    return value.trim()
  }
  const list = (value) => {
    if (!Array.isArray(value)) throw new ClientError('Invalid catalog response.', 502)
    return value
  }
  const choice = (value, values) => {
    if (!values.includes(value)) throw new ClientError('Invalid catalog status. Please refresh.', 502)
    return value
  }
  const avatar = (value) => ({
    avatarUrl: typeof value?.url === 'string' && /^https?:\/\//.test(value.url) ? value.url : null,
    avatarEmoji:
      typeof value?.emoji?.id === 'string'
        ? { id: value.emoji.id, unified: typeof value.emoji.unified === 'string' ? value.emoji.unified : null }
        : null
  })
  const expert = (value, locale) => {
    const xpert = value?.xpert
    return {
      kind: 'experts',
      id: required(xpert?.id, 'Expert ID'),
      name: (locale?.startsWith('zh') ? text(xpert.titleCN) : '') || text(xpert.title) || text(xpert.name),
      description: localizedText(value.marketplace?.summary, locale) || localizedText(xpert.description, locale),
      publisher:
        text(xpert.createdBy?.fullName) ||
        [text(xpert.createdBy?.firstName), text(xpert.createdBy?.lastName)].filter(Boolean).join(' ') ||
        text(xpert.createdBy?.name) ||
        text(xpert.createdBy?.username),
      ...avatar(xpert.avatar),
      categories: [
        ...strings(value.marketplace?.businessCategories),
        ...(value.marketplace?.featured ? ['featured'] : [])
      ],
      tags: strings(value.marketplace?.technical?.categories),
      access: choice(value.accessStatus, ['owned', 'accessible', 'approved', 'requested', 'not_requested', 'rejected'])
    }
  }
  const application = (value, locale) => {
    const localized = (value) => localizedText(value, locale)
    const app = value?.application
    const presentation = app?.config?.presentation
    return {
      kind: 'applications',
      id: required(app?.id, 'App ID'),
      pluginName: required(app.pluginName, 'Plugin name'),
      appName: required(app.appName, 'App name'),
      name: localized(app.displayName),
      description: localized(presentation?.tagline) || localized(app.description),
      publisher: text(presentation?.developer) || text(app.pluginName),
      ...avatar(null),
      categories: [
        ...(value.marketplace?.category ? [text(value.marketplace.category)] : []),
        ...(value.marketplace?.featured ? ['featured'] : [])
      ],
      tags: strings(value.marketplace?.tags),
      status: choice(value.status?.status, ['ready', 'not_installed', 'initializing', 'degraded', 'failed']),
      botId: text(value.status?.xpertId) || null,
      initializationAccess: text(value.status?.initializationAccess),
      summary: localized(presentation?.initializationSummary),
      steps: Array.isArray(presentation?.initializationSteps)
        ? presentation.initializationSteps.map(localized).filter(Boolean)
        : []
    }
  }
  const template = (value, locale) => ({
    kind: 'templates',
    id: required(value?.id, 'Template ID'),
    name: localizedText(value.title, locale) || text(value.name),
    description: localizedText(value.description, locale),
    publisher: text(value.pluginDisplayName) || text(value.pluginName) || 'Xpert',
    ...avatar(value.avatar),
    categories: value.category ? [text(value.category)] : [],
    tags: [],
    source: text(value.source) || 'builtin'
  })
  const scope = (service) => {
    if (!service.profile?.organizationId) throw new ClientError('Select an organization first.', 403)
  }
  const modelOptions = (value, locale) =>
    list(value).map((model) => ({
      id: required(model?.id, 'Model ID'),
      label: localizedText(model.label, locale) || text(model.model)
    }))
  const preflightReasons = {
    organization_scope_required: 'Select an organization first.',
    role_required: 'Organization administrator access is required to install this app.',
    scope_not_supported: 'This app cannot be installed in the current scope.',
    primary_model_required: "Configure the organization's primary model in Xpert.",
    embedding_model_required: 'Configure an available embedding model in Xpert.',
    vision_model_required: 'Configure an available vision model in Xpert.'
  }
  return {
    async listCatalog(kind) {
      scope(this)
      if (kind === 'applications')
        return list(await this.request('/api/plugin-applications/catalog')).map((item) =>
          application(item, this.config.locale)
        )
      if (!['experts', 'templates'].includes(kind)) throw new ClientError('Invalid catalog type.')
      const items = []
      let offset = 0
      while (true) {
        const path =
          kind === 'experts'
            ? `/api/xpert-marketplace?take=100&skip=${offset}&sort=updated`
            : `/api/xpert-template/catalog?limit=100&offset=${offset}`
        const page = await this.request(path)
        const entries = list(page?.items)
        if (typeof page.total !== 'number') throw new ClientError('Invalid catalog pagination.', 502)
        items.push(...entries)
        offset += entries.length
        if (!entries.length || offset >= page.total) break
      }
      return kind === 'experts'
        ? items.map((item) => expert(item, this.config.locale))
        : items
            .filter((item) => !item.application && ['agent', 'copilot'].includes(item.type))
            .map((item) => template(item, this.config.locale))
    },
    async requestExpertAccess(input) {
      scope(this)
      const id = required(input?.id, 'Expert ID')
      const reason = required(input?.reason, 'Request details', 500)
      const current = expert(await this.request(`/api/xpert-marketplace/${encodeURIComponent(id)}`), this.config.locale)
      if (!['not_requested', 'rejected'].includes(current.access)) return current
      await this.request(`/api/xpert-marketplace/${encodeURIComponent(id)}/access-requests`, {
        method: 'POST',
        body: { reason }
      })
      return expert(await this.request(`/api/xpert-marketplace/${encodeURIComponent(id)}`), this.config.locale)
    },
    async applicationSetup(input) {
      scope(this)
      const pluginName = required(input?.pluginName, 'Plugin name')
      const appName = required(input?.appName, 'App name')
      const detail = await this.request(
        `/api/plugin-applications/detail?${new URLSearchParams({ pluginName, appName })}`
      )
      const check = detail?.preflight
      if (!check || typeof check.canInitialize !== 'boolean')
        throw new ClientError('Invalid installation check response.', 502)
      const embeddingModels = modelOptions(check.embeddingModels, this.config.locale)
      const visionModels = modelOptions(check.visionModels, this.config.locale)
      return {
        application: application(detail, this.config.locale),
        canInitialize: check.supported === true && check.canInitialize,
        reason:
          preflightReasons[check.reason] ||
          (check.canInitialize ? '' : 'This app cannot be installed. Check the platform settings.'),
        embeddingModels,
        visionModels,
        requireEmbedding: check.modelRequirements?.embedding === true,
        requireVision: check.modelRequirements?.vision === true,
        embeddingLabel: localizedText(check.modelRequirements?.embeddingLabel, this.config.locale) || 'Embedding model',
        visionLabel: localizedText(check.modelRequirements?.visionLabel, this.config.locale) || 'Vision model',
        defaultEmbeddingModelId: embeddingModels.find((item) => item.id === check.defaultEmbeddingModelId)?.id || '',
        defaultVisionModelId: visionModels.find((item) => item.id === check.defaultVisionModelId)?.id || ''
      }
    },
    async initializeApplication(input) {
      const setup = await this.applicationSetup(input)
      if (setup.application.status === 'ready' && setup.application.botId) return { botId: setup.application.botId }
      if (!setup.canInitialize) throw new ClientError(setup.reason, 403)
      if (setup.application.status === 'initializing')
        throw new ClientError('The app is installing. Refresh shortly.', 409)
      const body = {
        pluginName: setup.application.pluginName,
        appName: setup.application.appName,
        operationId: required(input?.operationId, 'Installation operation ID', 128)
      }
      for (const [field, options, needed] of [
        ['embeddingModelId', setup.embeddingModels, setup.requireEmbedding],
        ['visionModelId', setup.visionModels, setup.requireVision]
      ]) {
        const id = input?.[field]
        if (id && !options.some((item) => item.id === id))
          throw new ClientError('The selected model is no longer available. Select another model.')
        if (needed && !id) throw new ClientError('Select the models required for installation.')
        if (id) body[field] = id
      }
      // The server derives the workspace and organization. Renderer-supplied scope is never forwarded.
      const result = await this.request('/api/plugin-applications/initialize', {
        method: 'POST',
        body,
        timeout: 180000
      })
      if (result?.status !== 'ready' || !result.xpertId)
        throw new ClientError('The app is not ready yet. Refresh the catalog to check its status.', 409)
      return { botId: required(result.xpertId, 'Assistant ID') }
    },
    async templateWorkspaces() {
      scope(this)
      const result = await this.request('/api/xpert-workspace/my?purpose=authoring')
      return list(result?.items)
        .filter((item) => item.capabilities?.canWrite === true)
        .map((item) => ({
          id: required(item.id, 'Workspace ID'),
          name: text(item.name)
        }))
    },
    async installTemplate(input) {
      scope(this)
      const id = required(input?.id, 'Template ID')
      const workspaceId = required(input?.workspaceId, 'Workspace ID')
      const title = required(input?.title, 'Assistant name', 100)
      const workspaces = await this.templateWorkspaces()
      if (!workspaces.some((item) => item.id === workspaceId))
        throw new ClientError('You do not have edit access to this workspace.', 403)
      const detail = await this.request(`/api/xpert-template/${encodeURIComponent(id)}`)
      if (detail?.application || !['agent', 'copilot'].includes(detail?.type))
        throw new ClientError('Install this resource from the Apps tab.')
      const result = await this.request(`/api/xpert-template/${encodeURIComponent(id)}/install`, {
        method: 'POST',
        body: { workspaceId, publish: true, basic: { title } },
        timeout: 180000,
        retry: false
      })
      return { botId: required(result?.xpert?.id, 'Installed assistant ID') }
    }
  }
}
