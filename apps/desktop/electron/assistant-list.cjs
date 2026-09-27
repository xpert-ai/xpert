const randomUUID = () => globalThis.crypto.randomUUID()

const DEFAULT_SIDEBAR = { width: 320, collapsed: false, sections: [], items: [], copies: [] }
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

function createAssistantListMethods(ClientError) {
  function scope(service) {
    if (!service.profile?.organizationId) throw new ClientError('Select an organization first.', 403)
    return JSON.stringify([
      service.config.apiUrl,
      service.profile.user.tenantId,
      service.profile.user.id,
      service.profile.organizationId
    ])
  }
  function bot(service, id) {
    const value = service.bots.find((item) => item.id === id)
    if (!value) throw new ClientError('Select a Bot in the current workspace first.', 403)
    return value
  }
  function required(value) {
    if (!text(value) || value.length > 200) throw new ClientError('Enter a name with 1–200 characters.')
    return value.trim()
  }
  async function conversation(service, input) {
    bot(service, input?.botId)
    if (!text(input.threadId)) throw new ClientError('No conversation is available yet.')
    const value = await service.request(
      `/api/chat-conversation/by-thread?threadId=${encodeURIComponent(input.threadId)}`
    )
    if (!value || value.xpertId !== (bot(service, input.botId).assistantId || input.botId) || !text(value.id))
      throw new ClientError('This conversation does not belong to the assistant.', 403)
    return { id: value.id, title: text(value.title), threadId: text(value.threadId) }
  }
  return {
    decorateBots(items) {
      const sidebar = this.sidebarState()
      const entries = [...items.map((item) => ({ ...item, assistantId: item.id }))]
      for (const copy of sidebar.copies || []) {
        const source = items.find((item) => item.id === copy.assistantId)
        if (source) entries.push({ ...source, id: copy.id, assistantId: source.id })
      }
      return entries.map((entry) => ({
        ...entry,
        ...(sidebar.items.find((item) => item.botId === entry.id)?.profile || {})
      }))
    },
    sidebarState() {
      const value = this.sidebars[scope(this)]
      return structuredClone(value ? { ...DEFAULT_SIDEBAR, ...value } : DEFAULT_SIDEBAR)
    },
    updateSidebar(input) {
      const key = scope(this)
      const value = this.sidebarState()
      if (input?.action === 'layout') {
        if (typeof input.width !== 'number' || !Number.isFinite(input.width) || typeof input.collapsed !== 'boolean')
          throw new ClientError('Invalid sidebar settings.')
        value.width = Math.round(Math.max(240, Math.min(520, input.width)))
        value.collapsed = input.collapsed
      } else if (input?.action === 'section') {
        const name = required(input.name)
        if (value.sections.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
          throw new ClientError('A section with this name already exists.')
        if (value.sections.length >= 50) throw new ClientError('You can create up to 50 sections.')
        if (input.botId) bot(this, input.botId)
        const id = randomUUID()
        value.sections.push({ id, name })
        if (input.botId) {
          const item = value.items.find((item) => item.botId === input.botId) || { botId: input.botId }
          value.items = value.items.filter((item) => item.botId !== input.botId)
          value.items.push({ ...item, sectionId: id })
        }
      } else {
        bot(this, input?.botId)
        const item = value.items.find((item) => item.botId === input.botId) || { botId: input.botId }
        if (input.action === 'pin' && typeof input.pinned === 'boolean')
          item.pinnedAt = input.pinned ? Date.now() : null
        else if (input.action === 'unread' && typeof input.unread === 'boolean')
          item.unreadAt = input.unread ? Date.now() : null
        else if (
          input.action === 'move' &&
          (input.sectionId === null || value.sections.some((section) => section.id === input.sectionId))
        )
          item.sectionId = input.sectionId
        else throw new ClientError('Invalid sidebar settings.')
        value.items = value.items.filter((item) => item.botId !== input.botId)
        value.items.push(item)
      }
      this.sidebars[key] = value
      this.persist()
      return this.sidebarState()
    },
    async botActivity() {
      scope(this)
      const ids = [...new Set(this.bots.map((item) => item.assistantId || item.id))]
      if (!ids.length) return []
      const result = await this.request('/api/chat-conversation/unread/xperts', {
        method: 'POST',
        body: { xpertIds: ids }
      })
      if (!Array.isArray(result)) throw new ClientError('Invalid conversation activity response.')
      return result
        .filter((item) => item && ids.includes(item.xpertId))
        .map((item) => ({
          xpertId: item.xpertId,
          unreadMessages: Math.max(0, Number(item.unreadMessages) || 0),
          unreadConversations: Math.max(0, Number(item.unreadConversations) || 0),
          latestUnreadAt: text(item.latestUnreadAt),
          latestUnreadConversationId: text(item.latestUnreadConversationId),
          latestUnreadThreadId: text(item.latestUnreadThreadId),
          latestConversationAt: text(item.latestConversationAt),
          latestConversationId: text(item.latestConversationId),
          latestConversationThreadId: text(item.latestConversationThreadId),
          latestConversationTitle: text(item.latestConversationTitle)
        }))
    },
    botConversation(input) {
      return conversation(this, input)
    },
    async markBotRead(input) {
      const value = await conversation(this, input)
      await this.request(`/api/chat-conversation/${encodeURIComponent(value.id)}/read-state`, {
        method: 'POST',
        body: {}
      })
      this.updateSidebar({ action: 'unread', botId: input.botId, unread: false })
      return { read: true }
    },
    async markAllBotRead(id) {
      const assistantId = bot(this, id).assistantId || id
      let skip = 0
      while (true) {
        const data = encodeURIComponent(JSON.stringify({ take: 100, skip, order: { updatedAt: 'DESC' } }))
        const result = await this.request(
          `/api/chat-conversation/xpert/${encodeURIComponent(assistantId)}?data=${data}`
        )
        if (!Array.isArray(result?.items)) throw new ClientError('Invalid conversation activity response.')
        for (let offset = 0; offset < result.items.length; offset += 5) {
          await Promise.all(
            result.items.slice(offset, offset + 5).map((item) => {
              if (!text(item.id) || (item.xpertId && item.xpertId !== assistantId))
                throw new ClientError('Invalid conversation activity response.')
              return this.request(`/api/chat-conversation/${encodeURIComponent(item.id)}/read-state`, {
                method: 'POST',
                body: {}
              })
            })
          )
        }
        skip += result.items.length
        if (!result.items.length || skip >= result.total) break
      }
      return this.updateSidebar({ action: 'unread', botId: id, unread: false })
    },
    editBot(input) {
      const item = bot(this, input?.botId)
      const name = required(input.name)
      if (typeof input.description !== 'string' || input.description.length > 4000)
        throw new ClientError('Keep the description within 4,000 characters.')
      const key = scope(this)
      const value = this.sidebarState()
      const preference = value.items.find((entry) => entry.botId === item.id) || { botId: item.id }
      preference.profile = { name, description: input.description.trim() }
      value.items = [...value.items.filter((entry) => entry.botId !== item.id), preference]
      this.sidebars[key] = value
      this.persist()
      this.bots = this.decorateBots(this.sourceBots)
      return { botId: item.id }
    },
    duplicateBot(input) {
      const item = bot(this, input?.botId)
      const name = required(input.name)
      const key = scope(this)
      const value = this.sidebarState()
      if (value.copies.length >= 100) throw new ClientError('You can create up to 100 local assistant copies.')
      const id = randomUUID()
      value.copies.push({ id, assistantId: item.assistantId || item.id })
      value.items.push({
        botId: id,
        sectionId: value.items.find((entry) => entry.botId === item.id)?.sectionId ?? null,
        profile: { name, description: item.description }
      })
      this.sidebars[key] = value
      this.persist()
      this.bots = this.decorateBots(this.sourceBots)
      return { botId: id }
    }
  }
}
module.exports = { createAssistantListMethods }
