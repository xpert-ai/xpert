import { of, Subject } from 'rxjs'
import type { ChatKitWorkbenchClientCommandRequest } from '@xpert-ai/chatkit-types'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { createChatkitWorkbenchClientCommandHandler } from './chatkit-workbench-client-command'

const manifest: XpertExtensionViewManifest = {
  key: 'platform.project-tasks__timeline',
  title: { en_US: 'Tasks' },
  hostType: 'agent',
  slot: 'agent.workbench.fixed',
  source: { provider: 'platform.project-tasks' },
  view: {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: { isolation: 'iframe', entry: 'project-tasks' },
    dataSource: { mode: 'platform' }
  },
  dataSource: { mode: 'platform' },
  clientCommands: [{ key: 'workbench.navigation.open', label: { en_US: 'Open' } }]
}
const request: ChatKitWorkbenchClientCommandRequest = {
  hostType: 'agent',
  hostId: 'assistant',
  viewKey: manifest.key,
  commandKey: 'workbench.navigation.open',
  payload: { target: 'assistant.conversation', conversationId: 'conversation', executionId: 'execution' }
}
function setup(views: XpertExtensionViewManifest[] = [manifest]) {
  const scope = { assistantId: 'assistant', runtimeScope: { projectId: 'project', conversationId: 'current' } }
  const getSlotViews = jest.fn(() => of(views))
  const execute = jest.fn().mockResolvedValue({ success: true, status: 'opened' })
  return {
    scope,
    getSlotViews,
    execute,
    run: createChatkitWorkbenchClientCommandHandler({
      getScope: () => ({ ...scope, runtimeScope: { ...scope.runtimeScope } }),
      views: { getSlotViews },
      commands: { execute }
    })
  }
}
describe('embedded ChatKit Workbench host bridge', () => {
  it('uses current server declarations and dispatches the exact execution to existing host commands', async () => {
    const { run, getSlotViews, execute } = setup()
    expect(await run(request)).toEqual({ success: true, status: 'opened' })
    expect(getSlotViews).toHaveBeenCalledWith('agent', 'assistant', 'agent.workbench.fixed', {
      runtimeScope: { projectId: 'project', conversationId: 'current' }
    })
    expect(execute).toHaveBeenCalledWith(request.commandKey, request.payload, {
      hostType: 'agent',
      hostId: 'assistant',
      viewKey: manifest.key,
      manifest
    })
  })
  it.each([
    { views: [] },
    { views: [{ ...manifest, visible: false }] },
    { views: [{ ...manifest, clientCommands: [] }] }
  ])('rejects missing, hidden or undeclared view commands', async ({ views }) => {
    const { run, execute } = setup(views)
    expect(await run(request)).toEqual({ success: false, code: 'forbidden' })
    expect(execute).not.toHaveBeenCalled()
  })
  it('rejects requests from a previous Assistant runtime', async () => {
    const { run, getSlotViews, execute } = setup()
    expect(await run({ ...request, hostId: 'old-assistant' })).toEqual({ success: false, code: 'stale_context' })
    expect(getSlotViews).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
  it('does not navigate if the project changed while loading declarations', async () => {
    const { run, scope, getSlotViews, execute } = setup()
    const pending = new Subject<XpertExtensionViewManifest[]>()
    getSlotViews.mockReturnValue(pending)
    const result = run(request)
    scope.runtimeScope.projectId = 'other-project'
    pending.next([manifest])
    expect(await result).toEqual({ success: false, code: 'stale_context' })
    expect(execute).not.toHaveBeenCalled()
    expect(pending.observed).toBe(false)
  })
})
