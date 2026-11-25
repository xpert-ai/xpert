const { parseWorkbenchNavigation } = require('./workbench-entry.mjs')
const { workbenchScope } = require('./workbench-scope.cjs')
const { createProjectWorkbenchMethods } = require('./project-workbench.cjs')
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)

function createWorkbenchEntryMethods(ClientError) {
  const project = createProjectWorkbenchMethods(ClientError)
  // Only domain adapters know how an intent becomes an Assistant/View destination.
  // Notification UI and ChatKit mounting remain unchanged when another adapter is added.
  const resolvers = {
    'project.pipelines': (service, target) => project.resolveProjectWorkbench.call(service, target),
    'workbench.view': async (service, target) => {
      const { organizationId, request } = workbenchScope(service, target, ClientError)
      const generation = service.generation
      const { projectId, viewKey, selectionId, parameters } = target
      const result = await service.request(
        `/api/xpert/${encodeURIComponent(target.assistantId)}/workbench-navigation`,
        {
          ...request,
          method: 'POST',
          body: { projectId, viewKey, selectionId, parameters }
        }
      )
      if (generation !== service.generation) throw new ClientError('The workspace changed. Please retry.', 409)
      const returned = parseWorkbenchNavigation({
        target: 'workbench.view',
        assistantId: result?.assistant?.id,
        organizationId: result?.organizationId,
        projectId: result?.projectId,
        ...result?.view
      })
      if (
        !returned ||
        returned.target !== 'workbench.view' ||
        !id(result.assistant.id) ||
        typeof result.assistant.name !== 'string' ||
        result.projectId !== projectId ||
        organizationId !== result.organizationId ||
        returned.viewKey !== viewKey ||
        returned.selectionId !== selectionId ||
        JSON.stringify(returned.parameters) !== JSON.stringify(parameters)
      )
        throw new ClientError('This result is unavailable. Refresh your workspace and retry.', 403)
      return {
        assistantId: result.assistant.id,
        projectId,
        organizationId,
        ...result.view,
        source: target,
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
  return {
    async resolveWorkbenchEntry(input) {
      const target = parseWorkbenchNavigation(input)
      if (!target) throw new ClientError('Unsupported operation.', 400)
      return resolvers[target.target](this, target)
    }
  }
}
module.exports = { createWorkbenchEntryMethods }
