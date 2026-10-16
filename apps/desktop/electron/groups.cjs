// Host credentials stay here; only a group-scoped session reaches the ChatKit frame.
function createGroupMethods(ClientError) {
  const groupId = (id) => {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new ClientError('Invalid input.')
    return encodeURIComponent(id)
  }
  return {
    async listGroups() {
      return this.request('/api/ai/groups', { scope: 'organization' })
    },
    async groupCandidates() {
      const candidates = []
      const seen = new Set()
      const limit = 100
      for (let offset = 0; ; offset += limit) {
        const page = await this.request(`/api/ai/groups/candidates?kind=assistant&limit=${limit}&offset=${offset}`, {
          scope: 'organization'
        })
        if (!Array.isArray(page)) throw new ClientError('Invalid response.')
        const fresh = page.filter((candidate) => !seen.has(candidate.subjectId))
        for (const candidate of fresh) seen.add(candidate.subjectId)
        candidates.push(...fresh)
        if (page.length < limit || !fresh.length) return candidates
      }
    },
    async createGroup(input) {
      if (
        typeof input?.title !== 'string' ||
        !input.title.trim() ||
        input.title.length > 200 ||
        typeof input.assistantId !== 'string'
      )
        throw new ClientError('Invalid input.')
      return this.request('/api/ai/groups', {
        scope: 'organization',
        method: 'POST',
        body: { title: input.title.trim(), assistantId: input.assistantId }
      })
    },
    async groupPreference(input) {
      if (!input || !['pinned', 'archived'].includes(input.key) || typeof input.value !== 'boolean')
        throw new ClientError('Invalid input.')
      return this.request(`/api/ai/groups/${groupId(input.id)}/preferences`, {
        scope: 'organization',
        method: 'PATCH',
        body: { [input.key]: input.value }
      })
    }
  }
}
module.exports = { createGroupMethods }
