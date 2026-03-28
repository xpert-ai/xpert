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
  let middleware: Awaited<ReturnType<XpertAuthoringMiddleware['createMiddleware']>>

  beforeEach(async () => {
    service = {
      newXpertFromContext: jest.fn(),
      editXpertFromContext: jest.fn()
    }
    middleware = await Promise.resolve(
      new XpertAuthoringMiddleware(service as any).createMiddleware({}, {} as any)
    )
  })

  it('exposes both authoring tools without mode config', () => {
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

    await middleware.tools[1].invoke(
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
