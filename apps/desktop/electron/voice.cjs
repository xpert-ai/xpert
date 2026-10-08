// Only short-lived, Assistant/thread-bound tickets leave the authenticated host.
const { apiRootUrl } = require('./connection/urls.mjs')
const uuid = (value) =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
function createVoiceMethods(ClientError) {
  function assistant(service, input) {
    const bot = service.bots.find((item) => item.id === input?.botId)
    if (!bot || !service.profile?.organizationId)
      throw new ClientError('Select a Bot in the current workspace first.', 403)
    const id = input.assistantId || bot.assistantId || bot.id
    if (!uuid(id)) throw new ClientError('Invalid assistant settings.')
    return id
  }
  return {
    async voiceCapability(input) {
      const id = assistant(this, input)
      const result = await this.request(`/api/ai/assistants/${id}/voice`, { scope: 'organization' })
      return { enabled: result?.enabled === true }
    },
    async voiceStart(input) {
      const assistantId = assistant(this, input)
      let threadId = input.threadId
      if (threadId && !uuid(threadId)) throw new ClientError('Invalid assistant settings.')
      if (!['web', 'desktop'].includes(input.originMode)) throw new ClientError('Invalid assistant settings.')
      const generation = this.generation
      if (!threadId) {
        const thread = await this.request('/api/ai/threads', {
          method: 'POST',
          scope: 'organization',
          retry: false,
          body: { assistant_id: assistantId }
        })
        threadId = thread?.thread_id
        if (!uuid(threadId)) throw new ClientError('Invalid service response. Check the API URL.', 502)
      }
      const ticket = await this.request(`/api/ai/threads/${threadId}/voice/sessions`, {
        method: 'POST',
        scope: 'organization',
        retry: false,
        body: { assistantId, originMode: input.originMode }
      })
      if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
      if (
        !uuid(ticket?.sessionId) ||
        !uuid(ticket?.conversationId) ||
        !/^[a-f0-9]{64}$/.test(ticket?.ticket) ||
        ticket.path !== '/api/ai/voice/stream' ||
        ticket.inputSampleRate !== 16000 ||
        ticket.outputSampleRate !== 24000
      )
        throw new ClientError('Invalid service response. Check the API URL.', 502)
      const url = new URL(`${apiRootUrl(this.config.apiUrl)}${ticket.path}`)
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new ClientError('Voice calls require HTTPS.', 400)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      return {
        sessionId: ticket.sessionId,
        conversationId: ticket.conversationId,
        threadId,
        assistantId,
        url: url.href,
        ticket: ticket.ticket
      }
    },
    async voiceEnd(input) {
      if (!uuid(input?.threadId) || !uuid(input?.sessionId)) throw new ClientError('Invalid assistant settings.')
      const result = await this.request(`/api/ai/threads/${input.threadId}/voice/sessions/${input.sessionId}/end`, {
        method: 'POST',
        scope: 'organization',
        retry: false,
        body: {}
      })
      return { ended: true, call: result.call }
    }
  }
}
module.exports = { createVoiceMethods }
