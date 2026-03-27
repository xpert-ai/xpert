jest.mock('../xpert.service', () => ({
  XpertService: class XpertService {}
}))

import { XpertAuthoringDomainService } from './xpert-authoring-domain.service'

describe('XpertAuthoringDomainService', () => {
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

    const service = new XpertAuthoringDomainService(xpertService as any)

    const result = await service.mutateDraft({
      xpertId: null,
      profileId: 'workspace-create',
      mutationType: 'create_xpert_draft_from_request',
      baseDraftHash: null,
      payload: {
        workspaceId: 'workspace-1',
        userIntent: 'Create a support expert'
      }
    })

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
        updatedDraftFragment: expect.objectContaining({
          team: expect.objectContaining({
            id: 'xpert-1',
            workspaceId: 'workspace-1'
          })
        })
      })
    )
  })

  it('uses the payload workspaceId when context workspaceId is missing', async () => {
    const createdXpert = {
      id: 'xpert-2',
      name: 'Support Expert',
      title: 'Support Expert',
      workspaceId: 'workspace-from-payload'
    }

    const persistedXpert = {
      id: 'xpert-2',
      name: 'Support Expert',
      title: 'Support Expert',
      type: 'agent',
      workspaceId: 'workspace-from-payload',
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

    const service = new XpertAuthoringDomainService(xpertService as any)

    await service.createWorkspaceDraftFromContext(
      {
        mode: 'workspace-create',
        workspaceId: null
      },
      {
        workspaceId: 'workspace-from-payload',
        userIntent: 'Create a support expert'
      }
    )

    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-from-payload'
      })
    )
  })

  it('rejects workspace draft creation when workspaceId is missing', async () => {
    const xpertService = {
      create: jest.fn(),
      validateName: jest.fn(),
      saveDraft: jest.fn(),
      repository: {
        findOne: jest.fn()
      }
    }

    const service = new XpertAuthoringDomainService(xpertService as any)

    const result = await service.mutateDraft({
      xpertId: null,
      profileId: 'workspace-create',
      mutationType: 'create_xpert_draft_from_request',
      baseDraftHash: null,
      payload: {
        userIntent: 'Create a support expert'
      }
    })

    expect(result).toEqual(
      expect.objectContaining({
        status: 'rejected',
        summary: 'Missing workspaceId for workspace creation.'
      })
    )
    expect(xpertService.create).not.toHaveBeenCalled()
  })
})
