// The authenticated host resolves scope; ChatKit owns the resulting navigation.
const { workbenchScope } = require('./workbench-scope.cjs')
function createWorkbenchMethods(ClientError) {
  const id = (value) =>
    typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value) && !['.', '..'].includes(value)
  return {
    ...require('./artifact-grants.cjs').createArtifactGrantMethods(ClientError),
    async workbenchSession({
      botId,
      target,
      assistantId: currentAssistantId,
      conversationId,
      projectId,
      threadId,
      source,
      sourceAssistantId
    } = {}) {
      const bot = this.bots.find((item) => item.id === botId)
      const generation = this.generation
      const entry = source ? await this.resolveWorkbenchEntry(source) : undefined
      if (entry && entry.assistantId !== sourceAssistantId)
        throw new ClientError('The workspace changed. Please retry.', 409)
      if (!bot && !entry) throw new ClientError('Select a Bot in the current workspace first.', 403)
      const requesterXpertId = entry?.assistantId || bot.assistantId || bot.id
      const organizationId = entry ? entry.organizationId : this.profile?.organizationId
      const requestScope = entry ? workbenchScope(this, entry.source, ClientError).request : {}
      let assistantId = requesterXpertId
      let canonicalProject = null
      let canonicalThread = null
      let conversation
      if (target === 'assistant.conversation' && id(conversationId)) {
        const query = new URLSearchParams({ requesterXpertId })
        if (organizationId) query.set('organizationId', organizationId)
        const resolved = await this.request(
          `/api/chat-conversation/${encodeURIComponent(conversationId)}/workbench-navigation?${query}`,
          requestScope
        )
        if (
          resolved?.conversationId !== conversationId ||
          !id(resolved?.xpertId) ||
          !id(resolved?.threadId) ||
          !(resolved.projectId === null || id(resolved.projectId)) ||
          (threadId && resolved.threadId !== threadId) ||
          (projectId && resolved.projectId !== projectId)
        )
          throw new ClientError('Unsupported operation.', 409)
        assistantId = resolved.xpertId
        canonicalProject = resolved.projectId
        canonicalThread = resolved.threadId
        conversation = { id: conversationId, requesterXpertId }
      } else if (target === 'assistant.project' && id(projectId)) {
        if (currentAssistantId !== undefined && !id(currentAssistantId))
          throw new ClientError('Unsupported operation.', 400)
        // The session endpoint authorizes the requested Project's exact Assistant binding.
        assistantId = currentAssistantId ?? requesterXpertId
        canonicalProject = projectId
      } else if (target === 'workbench.view' && entry) {
        assistantId = entry.assistantId
        canonicalProject = entry.projectId
      } else throw new ClientError('Unsupported operation.', 400)
      if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
      const result = await this.request('/api/ai/v1/chatkit/sessions', {
        ...requestScope,
        method: 'POST',
        body: {
          assistant: { id: assistantId },
          ...(canonicalProject ? { project: { id: canonicalProject } } : {}),
          ...(conversation ? { conversation } : {})
        }
      })
      if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
      if (typeof result?.client_secret !== 'string' || !result.client_secret)
        throw new ClientError('Could not create a ChatKit session.')
      this.appearanceAssistantIds ??= new Map()
      this.appearanceAssistantIds.set(assistantId, generation)
      return {
        assistantId,
        projectId: canonicalProject,
        threadId: canonicalThread,
        ...(conversation ? { conversationId } : {}),
        secret: result.client_secret,
        organizationId: organizationId ?? undefined
      }
    }
  }
}
module.exports = { createWorkbenchMethods }
