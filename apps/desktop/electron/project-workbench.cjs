// Resolve the Assistant from authorized Project bindings, never from the sidebar or a View payload.
const { parseProjectNavigation } = require('./project-navigation.mjs')
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)
const viewKey = 'platform.project-tasks__timeline'

const { workbenchScope } = require('./workbench-scope.cjs')

function createProjectWorkbenchMethods(ClientError) {
  return {
    async resolveProjectWorkbench(input) {
      const target = parseProjectNavigation(input)
      if (!target) throw new ClientError('Unsupported operation.', 400)
      const { organizationId, request } = workbenchScope(this, target, ClientError)
      const generation = this.generation
      const query = new URLSearchParams()
      for (const key of ['pipelineInstanceId', 'pipelineRoundId', 'pipelineNodeId'])
        if (target[key]) query.set(key, target[key])
      const result = await this.request(
        `/api/xpert-project/${encodeURIComponent(target.projectId)}/pipelines/workbench-navigation?${query}`,
        request
      )
      if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
      if (
        result?.projectId !== target.projectId ||
        result.organizationId !== organizationId ||
        !id(result.assistant?.id) ||
        typeof result.assistant.name !== 'string' ||
        result.view?.viewKey !== viewKey ||
        result.view.parameters?.initialTab !== 'pipeline' ||
        ['pipelineInstanceId', 'pipelineRoundId', 'pipelineNodeId'].some(
          (key) => result.view.parameters[key] !== target[key]
        )
      )
        throw new ClientError('This project view is not available. Check access and retry.', 403)
      return {
        assistantId: result.assistant.id,
        projectId: target.projectId,
        organizationId,
        viewKey,
        parameters: { initialTab: 'pipeline', ...Object.fromEntries(query) },
        source: { ...target, organizationId },
        bot: {
          id: result.assistant.id,
          assistantId: result.assistant.id,
          name: result.assistant.name,
          description: '',
          avatarUrl: null,
          avatarEmoji: null
        }
      }
    }
  }
}
module.exports = { createProjectWorkbenchMethods }
