jest.mock('./xpert-authoring.service', () => ({
  XpertAuthoringService: class XpertAuthoringService {}
}))

import { XpertAuthoringMiddleware } from './xpert-authoring.middleware'
import { AssistantDraftMutationResult, AuthoringToolName } from './xpert-authoring.types'

describe('XpertAuthoringMiddleware', () => {
  let service: {
    newXpertFromContext: jest.Mock
    editXpertFromContext: jest.Mock
  }

  beforeEach(() => {
    service = {
      newXpertFromContext: jest.fn(),
      editXpertFromContext: jest.fn()
    }
  })

  it('exposes only newXpert in workspace-create mode', async () => {
    const middleware = await Promise.resolve(
      new XpertAuthoringMiddleware(service as any).createMiddleware(
        { mode: 'workspace-create' },
        {} as any
      )
    )

    expect(middleware.tools.map((tool) => tool.name)).toEqual(['newXpert'])
    expect((middleware.tools[0].schema as any).shape.workspaceId).toBeUndefined()
  })

  it('exposes only editXpert in studio-agent-edit mode', async () => {
    const middleware = await Promise.resolve(
      new XpertAuthoringMiddleware(service as any).createMiddleware(
        { mode: 'studio-agent-edit' },
        {} as any
      )
    )

    expect(middleware.tools.map((tool) => tool.name)).toEqual(['editXpert'])
  })

  it('exposes newXpert and editXpert in platform-chatkit mode', async () => {
    const middleware = await Promise.resolve(
      new XpertAuthoringMiddleware(service as any).createMiddleware(
        { mode: 'platform-chatkit' },
        {} as any
      )
    )

    expect(middleware.tools.map((tool) => tool.name)).toEqual(['newXpert', 'editXpert'])
  })

  it('emits navigate_to_studio after newXpert succeeds', async () => {
    service.newXpertFromContext.mockResolvedValue(
      buildAppliedResult('newXpert', {
        team: {
          id: 'xpert-1'
        }
      })
    )

    const subscriber = {
      next: jest.fn()
    }
    const middleware = await Promise.resolve(
      new XpertAuthoringMiddleware(service as any).createMiddleware(
        { mode: 'workspace-create' },
        {} as any
      )
    )

    await middleware.tools[0].invoke(
      {
        userIntent: 'Create a support expert'
      },
      {
        configurable: {
          context: {
            workspaceId: 'assistant-workspace',
            env: {
              workspaceId: 'workspace-1',
              region: 'cn'
            }
          },
          subscriber,
          tool_call_id: 'tool-call-1',
          executionId: 'execution-1',
          agentKey: 'Agent_1'
        }
      } as any
    )

    expect(service.newXpertFromContext).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'workspace-create',
        workspaceId: 'assistant-workspace',
        env: {
          workspaceId: 'workspace-1',
          region: 'cn'
        }
      }),
      {
        userIntent: 'Create a support expert'
      }
    )
    expect(subscriber.next).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            name: 'navigate_to_studio',
            args: {
              xpertId: 'xpert-1'
            }
          })
        })
      })
    )
  })

  it('emits refresh_studio after editXpert succeeds', async () => {
    service.editXpertFromContext.mockResolvedValue(buildAppliedResult('editXpert'))

    const subscriber = {
      next: jest.fn()
    }
    const middleware = await Promise.resolve(
      new XpertAuthoringMiddleware(service as any).createMiddleware(
        { mode: 'studio-agent-edit' },
        {} as any
      )
    )

    await middleware.tools[0].invoke(
      {
        prompt: 'Improve the assistant prompt'
      },
      {
        configurable: {
          context: {
            targetXpertId: 'xpert-2',
            clientDraftHash: 'hash-1'
          },
          subscriber,
          tool_call_id: 'tool-call-2',
          executionId: 'execution-2',
          agentKey: 'Agent_2'
        }
      } as any
    )

    expect(service.editXpertFromContext).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'studio-agent-edit',
        targetXpertId: 'xpert-2',
        clientDraftHash: 'hash-1'
      }),
      {
        prompt: 'Improve the assistant prompt'
      }
    )
    expect(subscriber.next).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            name: 'refresh_studio',
            args: {
              xpertId: 'xpert-2'
            }
          })
        })
      })
    )
  })
})

function buildAppliedResult(
  toolName: AuthoringToolName,
  updatedDraftFragment: Record<string, unknown> | null = null
): AssistantDraftMutationResult {
  return {
    status: 'applied',
    toolName,
    summary: 'Updated draft',
    syncMode: toolName === 'newXpert' ? 'none' : 'refresh',
    conflictType: null,
    requiresRefresh: toolName === 'editXpert',
    committedDraftHash: 'hash-1',
    updatedDraftFragment,
    warnings: []
  }
}
