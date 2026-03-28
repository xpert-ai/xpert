jest.mock('../xpert.service', () => ({
  XpertService: class XpertService {}
}))

import { createHash } from 'crypto'
import { AiModelTypeEnum } from '@metad/contracts'
import { XpertAuthoringService } from './xpert-authoring.service'

describe('XpertAuthoringService', () => {
  it('reloads the persisted xpert before building the workspace draft', async () => {
    const createdXpert = {
      id: 'xpert-1',
      name: 'Support Expert',
      title: 'Support Expert',
      workspaceId: null,
      graph: {
        nodes: [
          {
            type: 'agent',
            key: 'Agent_partial',
            position: { x: 0, y: 0 },
            entity: {
              key: 'Agent_partial'
            }
          }
        ],
        connections: []
      }
    }
    const persistedXpert = {
      id: 'xpert-1',
      name: 'Support Expert',
      title: 'Support Expert',
      type: 'agent',
      workspaceId: 'workspace-1',
      graph: {
        nodes: [
          {
            type: 'agent',
            key: 'Agent_full',
            position: { x: 0, y: 0 },
            entity: {
              key: 'Agent_full',
              name: 'Support Expert',
              title: 'Support Expert'
            }
          }
        ],
        connections: []
      },
      agent: {
        key: 'Agent_full',
        name: 'Support Expert',
        title: 'Support Expert'
      }
    }

    const xpertService = {
      create: jest.fn().mockResolvedValue(createdXpert),
      validateName: jest.fn().mockResolvedValue(true),
      saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
      repository: {
        findOne: jest.fn().mockResolvedValue(persistedXpert)
      }
    }

    const service = new XpertAuthoringService(xpertService as any)

    const result = await service.newXpertFromContext(
      {
        workspaceId: 'assistant-workspace',
        env: {
          workspaceId: 'workspace-1',
          region: 'cn'
        }
      },
      {
        userIntent: 'Create a support expert'
      }
    )

    expect(xpertService.repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'xpert-1' }
      })
    )
    expect(xpertService.saveDraft).toHaveBeenCalledWith(
      'xpert-1',
      expect.objectContaining({
        team: expect.objectContaining({
          agent: expect.objectContaining({
            key: 'Agent_full'
          }),
          workspaceId: 'workspace-1'
        }),
        nodes: [
          expect.objectContaining({
            key: 'Agent_full'
          })
        ]
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        status: 'applied',
        toolName: 'newXpert',
        updatedDraftFragment: expect.objectContaining({
          team: expect.objectContaining({
            id: 'xpert-1',
            workspaceId: 'workspace-1'
          })
        })
      })
    )
  })

  it('uses context.env.workspaceId when creating a new draft', async () => {
    const createdXpert = {
      id: 'xpert-2',
      name: 'Support Expert',
      title: 'Support Expert',
      workspaceId: 'workspace-from-env'
    }

    const persistedXpert = {
      id: 'xpert-2',
      name: 'Support Expert',
      title: 'Support Expert',
      type: 'agent',
      workspaceId: 'workspace-from-env',
      graph: {
        nodes: [],
        connections: []
      },
      agent: {
        key: 'Agent_full',
        name: 'Support Expert',
        title: 'Support Expert'
      }
    }

    const xpertService = {
      create: jest.fn().mockResolvedValue(createdXpert),
      validateName: jest.fn().mockResolvedValue(true),
      saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
      repository: {
        findOne: jest.fn().mockResolvedValue(persistedXpert)
      }
    }

    const service = new XpertAuthoringService(xpertService as any)

    await service.newXpertFromContext(
      {
        workspaceId: 'assistant-workspace',
        env: {
          workspaceId: 'workspace-from-env',
          region: 'cn'
        }
      },
      {
        userIntent: 'Create a support expert'
      }
    )

    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-from-env'
      })
    )
  })

  it('rejects workspace draft creation when env.workspaceId is missing', async () => {
    const xpertService = {
      create: jest.fn(),
      validateName: jest.fn(),
      saveDraft: jest.fn(),
      repository: {
        findOne: jest.fn()
      }
    }

    const service = new XpertAuthoringService(xpertService as any)

    const result = await service.newXpertFromContext(
      {
        workspaceId: 'assistant-workspace'
      },
      {
        userIntent: 'Create a support expert'
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'rejected',
        toolName: 'newXpert',
        summary: 'Missing workspaceId for workspace creation.'
      })
    )
    expect(xpertService.create).not.toHaveBeenCalled()
  })

  it('updates team, primary agent and starters in a single edit', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-3',
        name: 'Support Expert',
        title: 'Support Expert',
        description: 'Old description',
        starters: ['Hello'],
        agent: {
          key: 'Agent_1',
          name: 'Support Expert',
          title: 'Support Expert',
          description: 'Old agent description',
          prompt: 'Old prompt',
          copilotModel: {
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4o'
          }
        }
      },
      nodes: [
        {
          type: 'agent',
          key: 'Agent_1',
          position: { x: 0, y: 0 },
          hash: 'old-node-hash',
          entity: {
            key: 'Agent_1',
            name: 'Support Expert',
            title: 'Support Expert',
            description: 'Old agent description',
            prompt: 'Old prompt',
            copilotModel: {
              modelType: AiModelTypeEnum.LLM,
              model: 'gpt-4o'
            }
          }
        }
      ],
      connections: []
    }
    const xpert = {
      id: 'xpert-3',
      draft: currentDraft
    }

    const xpertService = {
      saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
      repository: {
        findOne: jest.fn().mockResolvedValue(xpert)
      }
    }

    const service = new XpertAuthoringService(xpertService as any)
    const currentDraftHash = (service as any).calculateDraftHash(currentDraft)

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-3',
        clientDraftHash: currentDraftHash
      },
      {
        name: 'Support Copilot',
        description: 'New shared description',
        prompt: 'New prompt',
        model: {
          modelType: AiModelTypeEnum.LLM,
          model: 'gpt-5'
        },
        starters: ['How can I help?', 'Show me the latest status']
      }
    )

    expect(xpertService.saveDraft).toHaveBeenCalledTimes(1)

    const savedDraft = xpertService.saveDraft.mock.calls[0][1]
    expect(savedDraft.team).toEqual(
      expect.objectContaining({
        name: 'Support Copilot',
        title: 'Support Copilot',
        description: 'New shared description',
        starters: ['How can I help?', 'Show me the latest status']
      })
    )
    expect(savedDraft.team.agent).toEqual(
      expect.objectContaining({
        key: 'Agent_1',
        name: 'Support Copilot',
        title: 'Support Copilot',
        description: 'New shared description',
        prompt: 'New prompt',
        copilotModel: expect.objectContaining({
          model: 'gpt-5'
        })
      })
    )
    expect(savedDraft.nodes[0].entity).toEqual(
      expect.objectContaining({
        name: 'Support Copilot',
        title: 'Support Copilot',
        description: 'New shared description',
        prompt: 'New prompt'
      })
    )
    expect(savedDraft.nodes[0].hash).not.toBe('old-node-hash')
    expect(result).toEqual(
      expect.objectContaining({
        status: 'applied',
        toolName: 'editXpert',
        requiresRefresh: true
      })
    )
  })

  it('rejects editXpert when no supported fields are provided', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-4',
        agent: {
          key: 'Agent_1'
        }
      },
      nodes: [],
      connections: []
    }
    const xpert = {
      id: 'xpert-4',
      draft: currentDraft
    }

    const xpertService = {
      saveDraft: jest.fn(),
      repository: {
        findOne: jest.fn().mockResolvedValue(xpert)
      }
    }

    const service = new XpertAuthoringService(xpertService as any)

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-4',
        clientDraftHash: (service as any).calculateDraftHash(currentDraft)
      },
      {}
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'rejected',
        toolName: 'editXpert',
        summary: 'No supported fields were provided for editXpert.'
      })
    )
    expect(xpertService.saveDraft).not.toHaveBeenCalled()
  })

  it('returns unsaved-local conflict before loading the draft', async () => {
    const xpertService = {
      saveDraft: jest.fn(),
      repository: {
        findOne: jest.fn()
      }
    }

    const service = new XpertAuthoringService(xpertService as any)

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-5',
        clientDraftHash: 'hash-1',
        unsaved: true
      },
      {
        prompt: 'New prompt'
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'conflict',
        toolName: 'editXpert',
        conflictType: 'unsaved-local'
      })
    )
    expect(xpertService.repository.findOne).not.toHaveBeenCalled()
  })

  it('returns stale-server conflict when the draft hash changes', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-6',
        agent: {
          key: 'Agent_1'
        }
      },
      nodes: [],
      connections: []
    }
    const xpert = {
      id: 'xpert-6',
      draft: currentDraft
    }

    const xpertService = {
      saveDraft: jest.fn(),
      repository: {
        findOne: jest.fn().mockResolvedValue(xpert)
      }
    }

    const service = new XpertAuthoringService(xpertService as any)
    const expectedHash = createHash('sha256').update(JSON.stringify(currentDraft)).digest('hex')

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-6',
        clientDraftHash: 'stale-hash'
      },
      {
        prompt: 'New prompt'
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'conflict',
        toolName: 'editXpert',
        conflictType: 'stale-server',
        committedDraftHash: expectedHash
      })
    )
    expect(xpertService.saveDraft).not.toHaveBeenCalled()
  })
})
