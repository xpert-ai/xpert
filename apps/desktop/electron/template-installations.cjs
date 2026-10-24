// Only public installation receipts cross the Electron boundary; DSL and credentials stay in the host.
module.exports.createTemplateInstallationMethods = function (ClientError) {
  const required = (value) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 1000)
      throw new ClientError('Invalid installation request.', 400)
    return value
  }
  const scope = (service) => {
    if (!service.profile?.organizationId) throw new ClientError('Select an organization first.', 400)
  }
  const receipt = (value) => {
    if (
      !value ||
      !['running', 'interrupted', 'failed', 'succeeded'].includes(value.status) ||
      !['importing', 'dependencies', 'publishing', 'initializing', 'completed'].includes(value.stage) ||
      !Number.isInteger(value.attempt) ||
      typeof value.publish !== 'boolean' ||
      typeof value.retryable !== 'boolean' ||
      (value.assistantAvailability !== undefined &&
        !['available', 'unavailable'].includes(value.assistantAvailability)) ||
      !Array.isArray(value.resourceInstallationIds) ||
      !Array.isArray(value.pendingAuthInstallationIds)
    )
      throw new ClientError('Invalid installation response.', 502)
    return {
      id: required(value.id),
      templateId: required(value.templateId),
      workspaceId: required(value.workspaceId),
      status: value.status,
      stage: value.stage,
      attempt: value.attempt,
      publish: value.publish,
      assistantId: value.assistantId ? required(value.assistantId) : null,
      ...(value.assistantAvailability === undefined ? {} : { assistantAvailability: value.assistantAvailability }),
      retryable: value.retryable,
      resourceInstallationIds: value.resourceInstallationIds.map(required),
      pendingAuthInstallationIds: value.pendingAuthInstallationIds.map(required),
      createdAt: required(value.createdAt),
      updatedAt: required(value.updatedAt),
      error:
        value.error && ['INSTALL_FAILED', 'SOURCE_CHANGED'].includes(value.error.code)
          ? { code: value.error.code, message: required(value.error.message) }
          : null
    }
  }
  return {
    async createTemplateInstallation(input) {
      scope(this)
      return receipt(
        await this.request('/api/xpert-template-installations', {
          method: 'POST',
          body: input,
          retry: false,
          scope: 'organization',
          includeServerMessage: true
        })
      )
    },
    async getTemplateInstallation(id) {
      scope(this)
      return receipt(
        await this.request(`/api/xpert-template-installations/${encodeURIComponent(required(id))}`, {
          scope: 'organization'
        })
      )
    },
    async retryTemplateInstallation(id) {
      scope(this)
      return receipt(
        await this.request(`/api/xpert-template-installations/${encodeURIComponent(required(id))}/retry`, {
          method: 'POST',
          body: {},
          retry: false,
          scope: 'organization',
          includeServerMessage: true
        })
      )
    },
    async listTemplateInstallations(input) {
      scope(this)
      const skip = input?.skip ?? 0
      if (!Number.isInteger(skip) || skip < 0) throw new ClientError('Invalid installation request.', 400)
      const query = new URLSearchParams({ workspaceId: required(input?.workspaceId), skip: String(skip), take: '20' })
      const page = await this.request(`/api/xpert-template-installations?${query}`, { scope: 'organization' })
      if (!Array.isArray(page?.items) || !Number.isInteger(page.total))
        throw new ClientError('Invalid installation response.', 502)
      return { items: page.items.map(receipt), total: page.total }
    }
  }
}
