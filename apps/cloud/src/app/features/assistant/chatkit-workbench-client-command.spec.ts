import { of, Subject } from 'rxjs'
import type { ChatKitWorkbenchClientCommandRequest } from '@xpert-ai/chatkit-types'
import { createResourceCardContent, type XpertExtensionViewManifest } from '@xpert-ai/contracts'
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

const receipt = createResourceCardContent({
  resource: { namespace: 'platform', type: 'project', id: 'project' },
  title: 'Bid project',
  open: { target: 'assistant.project', projectId: 'project', viewKey: manifest.key }
})
const cardRequest = { ...request, resourceCard: { messageId: 'reply', id: receipt.id } }
describe('persisted Resource Card navigation', () => {
  function cards(allowed = true, projectId: string | null = 'project') {
    const execute = jest.fn().mockResolvedValue({ success: true })
    const getSlotViews = jest.fn(() => of([{ ...manifest, clientCommands: [] }]))
    const handler = createChatkitWorkbenchClientCommandHandler({
      getScope: () => ({ assistantId: 'assistant', runtimeScope: { conversationId: 'current', projectId } }),
      views: { getSlotViews },
      commands: { execute },
      conversations: {
        getMessages: jest.fn(() =>
          of({ total: 1, items: allowed ? [{ id: 'reply', role: 'ai', content: [receipt] }] : [] })
        )
      }
    })
    return { execute, handler, getSlotViews }
  }
  it('ignores a forged payload and navigates to the persisted platform Project', async () => {
    const { handler, execute } = cards()
    expect(
      await handler({
        ...cardRequest,
        payload: { target: 'assistant.project', projectId: 'forged' }
      })
    ).toEqual({ success: true })
    expect(execute).toHaveBeenCalledWith(
      request.commandKey,
      receipt.data.open,
      expect.objectContaining({ viewKey: manifest.key })
    )
  })
  it.each([null, 'another-project'])(
    'resolves the receipt Project independently of the mounted chat scope (%s)',
    async (projectId) => {
      const { handler, getSlotViews } = cards(true, projectId)
      expect(await handler(cardRequest)).toEqual({ success: true })
      expect(getSlotViews).toHaveBeenCalledWith('agent', 'assistant', 'agent.workbench.fixed', {
        runtimeScope: { projectId: 'project' }
      })
    }
  )

  it('rejects missing or inaccessible historical receipts', async () => {
    const { handler, execute } = cards(false)
    expect(await handler(cardRequest)).toEqual({
      success: false,
      code: 'forbidden'
    })
    expect(execute).not.toHaveBeenCalled()
  })
})
