// Profile extensions inherit server-side feature and organization authorization. A renderer
// can address only a known Bot and an enabled profile View, never arbitrary API URLs.
const { randomUUID } = require('node:crypto')
const { localizedText } = require('./i18n/index.mjs')
const { createEntry } = require('./profile-entry.cjs')
const sessions = new WeakMap()
const enc = encodeURIComponent
const text = (value) => (typeof value === 'string' ? value : null)
const count = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const identifier = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256
const statuses = ['idle', 'busy', 'pausing', 'paused', 'interrupted', 'error']

function createAssistantProfileMethods(ClientError) {
  function reject() {
    throw new ClientError('This profile operation is not available.', 403)
  }
  function assistant(service, botId) {
    if (!service.profile?.organizationId) reject()
    const bot = service.bots.find((item) => item.id === botId)
    if (!bot) reject()
    return bot.assistantId || bot.id
  }
  async function views(service, botId, slot = 'agent.profile.tabs') {
    const id = assistant(service, botId)
    const result = await service.request(`/api/view-hosts/agent/${enc(id)}/slots/${slot}/views`, {
      scope: 'organization'
    })
    if (!Array.isArray(result)) throw new ClientError('Invalid service response. Check the API URL.', 502)
    return result
      .filter(
        (view) =>
          identifier(view?.key) &&
          view.hostType === 'agent' &&
          view.slot === slot &&
          view.visible !== false &&
          object(view.view)
      )
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }
  function store(service) {
    if (!sessions.has(service)) sessions.set(service, new Map())
    return sessions.get(service)
  }
  function queryString(query, parametersOnly = false) {
    const search = new URLSearchParams()
    if (!object(query)) return search
    const keys = parametersOnly
      ? ['search', 'parameters']
      : ['page', 'pageSize', 'cursor', 'search', 'sortBy', 'sortDirection', 'selectionId', 'parameters', 'filters']
    for (const key of keys) {
      const value = query[key]
      if (value === undefined || value === null) continue
      if (key === 'parameters' || key === 'filters') search.set(key, JSON.stringify(value))
      else if (typeof value === 'string' || typeof value === 'number') search.set(key, String(value))
      else reject()
    }
    if (search.toString().length > 20000) reject()
    return search
  }
  return {
    async botProfile(botId) {
      const id = assistant(this, botId)
      const profile = await this.request(`/api/xpert/${enc(id)}/profile`, { scope: 'organization' })
      if (!profile || profile.id !== id || !object(profile.indicators)) reject()
      // Retain the display-only API boundary even when connected to an older server.
      return {
        id,
        name: text(profile.name) || '',
        title: text(profile.title),
        titleCN: text(profile.titleCN),
        description: localizedText(profile.description, this.config.locale),
        version: text(profile.version),
        tags: (Array.isArray(profile.tags) ? profile.tags : [])
          .filter((tag) => identifier(tag?.id) && text(tag.name))
          .map((tag) => ({ id: tag.id, name: tag.name })),
        workspace:
          identifier(profile.workspace?.id) && text(profile.workspace?.name)
            ? { id: profile.workspace.id, name: profile.workspace.name }
            : null,
        creator:
          identifier(profile.creator?.id) && text(profile.creator?.name)
            ? { id: profile.creator.id, name: profile.creator.name }
            : null,
        publishedAt: text(profile.publishedAt),
        createdAt: text(profile.createdAt),
        updatedAt: text(profile.updatedAt),
        indicators: {
          skillCount: count(profile.indicators.skillCount),
          toolCount: count(profile.indicators.toolCount),
          subAgentCount: count(profile.indicators.subAgentCount),
          conversationCount30d: count(profile.indicators.conversationCount30d)
        }
      }
    },
    async botConversations({ botId, page = 1 } = {}) {
      const id = assistant(this, botId)
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) reject()
      const data = enc(
        JSON.stringify({ where: { xpertId: id }, take: 5, skip: (page - 1) * 5, order: { updatedAt: 'DESC' } })
      )
      const result = await this.request(`/api/chat-conversation/my?data=${data}`, { scope: 'organization' })
      if (!Array.isArray(result?.items)) reject()
      return {
        total: count(result.total) || 0,
        items: result.items
          .filter((item) => identifier(item?.id) && item.xpertId === id)
          .map((item) => ({
            id: item.id,
            title: text(item.title),
            threadId: text(item.threadId),
            updatedAt: text(item.updatedAt),
            status: statuses.includes(item.status) ? item.status : null
          }))
      }
    },
    botProfileViews(botId) {
      return views(this, botId)
    },
    async openProfileView({ botId, viewKey } = {}) {
      const generation = this.generation
      const id = assistant(this, botId)
      const manifest = (await views(this, botId)).find((view) => view.key === viewKey)
      if (!manifest) reject()
      const base = `/api/view-hosts/agent/${enc(id)}/views/${enc(viewKey)}`
      const entries = store(this)
      for (const [key, entry] of entries)
        if (entry.generation !== generation) {
          entry.revoke?.()
          entries.delete(key)
        }
      if (entries.size >= 32) reject()
      const sessionId = randomUUID()
      const session = { botId, generation, base, manifest, id }
      const valid = () => entries.get(sessionId) === session && this.generation === generation
      entries.set(sessionId, session)
      try {
        if (manifest.view.type === 'remote_component') {
          if (manifest.view.protocolVersion !== 1) reject()
          const html = await this.request(`${base}/remote-component/entry`, {
            scope: 'organization',
            responseType: 'text'
          })
          if (!valid() || html.length > 15 * 1024 * 1024) reject()
          const entry = await createEntry(html, valid)
          session.revoke = entry.revoke
          session.entryUrl = entry.url
        }
        if (!valid()) reject()
        return { sessionId, entryUrl: session.entryUrl || null, manifest }
      } catch (error) {
        session.revoke?.()
        entries.delete(sessionId)
        throw error
      }
    },
    closeProfileView(sessionId) {
      const entries = store(this)
      entries.get(sessionId)?.revoke?.()
      entries.delete(sessionId)
      return { closed: true }
    },
    async profileViewRequest({
      sessionId,
      operation,
      query,
      actionKey,
      parameterKey,
      targetId,
      input,
      parameters,
      commandKey,
      payload
    } = {}) {
      const session = store(this).get(sessionId)
      if (!session || session.generation !== this.generation || assistant(this, session.botId) !== session.id) reject()
      // Recheck activation/visibility. The API independently checks action permissions on every request.
      const manifest = (await views(this, session.botId)).find((view) => view.key === session.manifest.key)
      if (!manifest || store(this).get(sessionId) !== session || session.generation !== this.generation) reject()
      const request = (path, options) => this.request(`${session.base}${path}`, { scope: 'organization', ...options })
      if (operation === 'data') return request(`/data?${queryString(query)}`)
      if (operation === 'options') {
        if (!manifest.parameters?.some((parameter) => parameter.key === parameterKey && parameter.optionSource))
          reject()
        return request(`/parameters/${enc(parameterKey)}/options?${queryString(query, true)}`)
      }
      if (operation === 'action') {
        const actions = [...(manifest.actions || []), ...(manifest.view.actions || [])]
        if (!actions.some((action) => action.key === actionKey && (action.transport || 'json') === 'json')) reject()
        return request(`/actions/${enc(actionKey)}`, { method: 'POST', body: { targetId, input, parameters } })
      }
      if (operation === 'command') {
        if (!manifest.clientCommands?.some((command) => command.key === commandKey)) reject()
        if (['assistant.profile.interaction', 'assistant.profile.close'].includes(commandKey)) return { success: true }
        if (
          commandKey === 'workbench.navigation.open' &&
          payload?.target === 'workbench.view' &&
          identifier(payload.viewKey)
        ) {
          const available = await views(this, session.botId, 'agent.workbench.fixed')
          const exact = available.find((view) => view.key === payload.viewKey)
          const aliases = available.filter((view) => view.key.endsWith(`__${payload.viewKey}`))
          const target = exact || (aliases.length === 1 ? aliases[0] : null)
          if (!target) reject()
          const url = new URL(`${this.config.webUrl}/chat/x/${enc(session.id)}`)
          url.searchParams.set('view', target.key)
          if (identifier(payload.selectionId)) url.searchParams.set('viewSelection', payload.selectionId)
          if (object(payload.parameters)) url.searchParams.set('viewParameters', JSON.stringify(payload.parameters))
          if (url.href.length > 20000) reject()
          return { success: true, url: url.href }
        }
      }
      reject()
    }
  }
}
module.exports = { createAssistantProfileMethods }
