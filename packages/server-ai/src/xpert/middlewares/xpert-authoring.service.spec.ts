jest.mock('../xpert.service', () => ({
  XpertService: class XpertService {}
}))

jest.mock('@metad/server-core', () => ({
  RequestContext: {
    currentUser: jest.fn()
  }
}))

jest.mock('../../knowledgebase/knowledgebase.service', () => ({
  KnowledgebaseService: class KnowledgebaseService {}
}))

jest.mock('../../xpert-agent/xpert-agent.service', () => ({
  XpertAgentService: class XpertAgentService {}
}))

jest.mock('../../xpert-toolset/xpert-toolset.service', () => ({
  XpertToolsetService: class XpertToolsetService {}
}))

import { RequestContext } from '@metad/server-core'
import { XpertExportCommand, XpertImportCommand } from '../commands'
import { ListWorkspaceSkillsQuery } from '../../xpert-agent/queries/list-workspace-skills.query'
import { XpertAuthoringService } from './xpert-authoring.service'

describe('XpertAuthoringService', () => {
  const buildPersistedXpert = (overrides: Record<string, any> = {}) => ({
    id: 'xpert-1',
    name: 'Support Expert',
    title: 'Support Expert',
    slug: 'support-expert',
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
            title: 'Support Expert',
            prompt: 'Help users'
          }
        }
      ],
      connections: []
    },
    agent: {
      id: 'agent-1',
      key: 'Agent_full',
      name: 'Support Expert',
      title: 'Support Expert',
      prompt: 'Help users'
    },
    ...overrides
  })

  const createService = (overrides: {
    xpertService?: Record<string, any>
    commandBus?: Record<string, any>
    queryBus?: Record<string, any>
    xpertAgentService?: Record<string, any>
    xpertToolsetService?: Record<string, any>
    knowledgebaseService?: Record<string, any>
  } = {}) => {
    const persistedXpert = buildPersistedXpert()
    const xpertService = {
      create: jest.fn().mockResolvedValue({ id: persistedXpert.id }),
      validateName: jest.fn().mockResolvedValue(true),
      validate: jest.fn().mockResolvedValue([]),
      saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
      repository: {
        findOne: jest.fn().mockResolvedValue(persistedXpert)
      },
      ...overrides.xpertService
    }
    const commandBus = {
      execute: jest.fn().mockImplementation((command) => {
        if (command instanceof XpertExportCommand) {
          return Promise.resolve({
            team: {
              id: persistedXpert.id,
              name: persistedXpert.name,
              title: persistedXpert.title,
              agent: {
                key: persistedXpert.agent.key
              }
            },
            nodes: persistedXpert.graph.nodes,
            connections: persistedXpert.graph.connections
          })
        }

        return Promise.resolve(persistedXpert)
      }),
      ...overrides.commandBus
    }
    const queryBus = {
      execute: jest.fn().mockResolvedValue([]),
      ...overrides.queryBus
    }
    const xpertAgentService = {
      getMiddlewareStrategies: jest.fn().mockReturnValue([]),
      ...overrides.xpertAgentService
    }
    const xpertToolsetService = {
      getAllByWorkspace: jest.fn().mockResolvedValue({ items: [] }),
      afterLoad: jest.fn().mockImplementation(async (items) => items),
      ...overrides.xpertToolsetService
    }
    const knowledgebaseService = {
      getAllByWorkspace: jest.fn().mockResolvedValue({ items: [] }),
      ...overrides.knowledgebaseService
    }

    return {
      xpertService,
      commandBus,
      queryBus,
      xpertAgentService,
      xpertToolsetService,
      knowledgebaseService,
      service: new XpertAuthoringService(
        xpertService as any,
        commandBus as any,
        queryBus as any,
        xpertAgentService as any,
        xpertToolsetService as any,
        knowledgebaseService as any
      )
    }
  }

  beforeEach(() => {
    ;(RequestContext.currentUser as jest.Mock).mockReturnValue({ id: 'user-1' })
  })

  it('reloads the persisted xpert before building the workspace draft and returns yaml', async () => {
    const createdXpert = {
      id: 'xpert-1',
      name: 'Support Expert',
      title: 'Support Expert',
      workspaceId: null
    }
    const persistedXpert = buildPersistedXpert()
    const { service, xpertService } = createService({
      xpertService: {
        create: jest.fn().mockResolvedValue(createdXpert),
        repository: {
          findOne: jest.fn().mockResolvedValue(persistedXpert)
        }
      }
    })

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
        dslYaml: expect.stringContaining('Support Expert'),
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
    const { service, xpertService } = createService()

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

  it('rejects workspace draft creation when workspaceId is missing from both env and top-level context', async () => {
    const { service, xpertService } = createService()

    const result = await service.newXpertFromContext(
      {},
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

  it('falls back to top-level workspaceId when env.workspaceId is absent', async () => {
    const { service, xpertService } = createService()

    await service.newXpertFromContext(
      {
        workspaceId: 'workspace-top-level'
      },
      {
        userIntent: 'Create a support expert'
      }
    )

    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-top-level'
      })
    )
  })

  it('returns the current xpert as yaml dsl', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-1',
        name: 'Support Expert',
        agent: {
          key: 'Agent_full'
        }
      },
      nodes: [],
      connections: []
    }
    const { service, commandBus } = createService({
      xpertService: {
        repository: {
          findOne: jest.fn().mockResolvedValue(
            buildPersistedXpert({
              id: 'xpert-1',
              draft: currentDraft
            })
          )
        }
      }
    })

    const result = await service.getCurrentXpertFromContext({
      targetXpertId: 'xpert-1'
    })

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(XpertExportCommand))
    expect(result).toEqual(
      expect.objectContaining({
        xpertId: 'xpert-1',
        dslYaml: expect.stringContaining('Support Expert'),
        committedDraftHash: (service as any).calculateDraftHash(currentDraft)
      })
    )
  })

  it('returns a rejected current xpert result when targetXpertId is missing', async () => {
    const { service } = createService()

    const result = await service.getCurrentXpertFromContext({})

    expect(result).toEqual({
      xpertId: null,
      dslYaml: null,
      summary: 'Missing xpertId for current Xpert DSL export.'
    })
  })

  it('returns available agent middlewares as a compact catalog', async () => {
    const { service, xpertAgentService } = createService({
      xpertAgentService: {
        getMiddlewareStrategies: jest.fn().mockReturnValue([
          {
            meta: {
              name: 'XpertAuthoringMiddleware',
              label: {
                en_US: 'Xpert Authoring Middleware'
              },
              description: {
                en_US: 'Provides authoring tools.'
              },
              icon: {
                type: 'svg',
                value: '<svg />'
              },
              configSchema: {
                type: 'object',
                properties: {}
              }
            }
          }
        ])
      }
    })

    const result = await service.getAvailableAgentMiddlewaresFromContext({
      env: {
        workspaceId: 'workspace-1'
      }
    })

    expect(xpertAgentService.getMiddlewareStrategies).toHaveBeenCalled()
    expect(result).toEqual({
      status: 'available',
      summary: 'Found 1 agent middlewares available to the assistant.',
      total: 1,
      workspaceId: 'workspace-1',
      items: [
        expect.objectContaining({
          name: 'XpertAuthoringMiddleware'
        })
      ]
    })
  })

  it('rejects toolset catalog lookup when workspaceId is missing', async () => {
    const { service, xpertToolsetService } = createService()

    const result = await service.getAvailableToolsetsFromContext({})

    expect(result).toEqual({
      status: 'rejected',
      summary: 'Missing workspaceId in request context.',
      total: 0,
      workspaceId: null,
      items: []
    })
    expect(xpertToolsetService.getAllByWorkspace).not.toHaveBeenCalled()
  })

  it('returns toolsets as a compact workspace catalog', async () => {
    const { service, xpertToolsetService } = createService({
      xpertToolsetService: {
        getAllByWorkspace: jest.fn().mockResolvedValue({
          items: [
            {
              id: 'toolset-1',
              name: 'Support Tools',
              category: 'builtin',
              type: 'search',
              description: 'Search tools',
              avatar: { type: 'icon', value: 'wrench' },
              tags: [{ name: 'search' }, { name: 'support' }]
            }
          ]
        }),
        afterLoad: jest.fn().mockImplementation(async (items) => items)
      }
    })

    const result = await service.getAvailableToolsetsFromContext({
      env: {
        workspaceId: 'workspace-1'
      }
    })

    expect(xpertToolsetService.getAllByWorkspace).toHaveBeenCalledWith(
      'workspace-1',
      {},
      false,
      expect.objectContaining({ id: 'user-1' })
    )
    expect(xpertToolsetService.afterLoad).toHaveBeenCalled()
    expect(result).toEqual({
      status: 'available',
      summary: "Found 1 toolsets available in workspace 'workspace-1'.",
      total: 1,
      workspaceId: 'workspace-1',
      items: [
        {
          id: 'toolset-1',
          name: 'Support Tools',
          category: 'builtin',
          type: 'search',
          description: 'Search tools',
          tags: ['search', 'support'],
          avatar: { type: 'icon', value: 'wrench' }
        }
      ]
    })
  })

  it('returns knowledgebases as a compact workspace catalog', async () => {
    const { service, knowledgebaseService } = createService({
      knowledgebaseService: {
        getAllByWorkspace: jest.fn().mockResolvedValue({
          items: [
            {
              id: 'kb-1',
              name: 'Support KB',
              description: 'FAQ and runbooks',
              status: 'indexed',
              permission: 'Organization',
              language: 'English',
              avatar: { type: 'icon', value: 'book' }
            }
          ]
        })
      }
    })

    const result = await service.getAvailableKnowledgebasesFromContext({
      env: {
        workspaceId: 'workspace-1'
      }
    })

    expect(knowledgebaseService.getAllByWorkspace).toHaveBeenCalledWith(
      'workspace-1',
      {},
      false,
      expect.objectContaining({ id: 'user-1' })
    )
    expect(result).toEqual({
      status: 'available',
      summary: "Found 1 knowledgebases available in workspace 'workspace-1'.",
      total: 1,
      workspaceId: 'workspace-1',
      items: [
        {
          id: 'kb-1',
          name: 'Support KB',
          description: 'FAQ and runbooks',
          status: 'indexed',
          permission: 'Organization',
          language: 'English',
          avatar: { type: 'icon', value: 'book' }
        }
      ]
    })
  })

  it('returns the current placeholder skill catalog as an empty available result', async () => {
    const { service, queryBus } = createService({
      queryBus: {
        execute: jest.fn().mockResolvedValue([])
      }
    })

    const result = await service.getAvailableSkillsFromContext({
      env: {
        workspaceId: 'workspace-1'
      }
    })

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListWorkspaceSkillsQuery))
    expect(result).toEqual({
      status: 'available',
      summary: "No skills are currently available in workspace 'workspace-1'.",
      total: 0,
      workspaceId: 'workspace-1',
      items: []
    })
  })

  it('rejects editXpert when the yaml is invalid', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-3',
        name: 'Support Expert',
        agent: {
          key: 'Agent_1'
        }
      },
      nodes: [],
      connections: []
    }
    const { service, commandBus } = createService({
      xpertService: {
        repository: {
          findOne: jest.fn().mockResolvedValue(
            buildPersistedXpert({
              id: 'xpert-3',
              draft: currentDraft
            })
          )
        }
      }
    })

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-3',
        baseDraftHash: (service as any).calculateDraftHash(currentDraft)
      },
      {
        dslYaml: 'team: ['
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'rejected',
        toolName: 'editXpert',
        summary: 'Invalid YAML DSL provided for editXpert.'
      })
    )
    expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
  })

  it('rejects editXpert when the candidate draft contains broken graph connections', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-graph',
        name: 'Support Expert',
        type: 'agent',
        agent: {
          key: 'Agent_current'
        }
      },
      nodes: [
        {
          type: 'agent',
          key: 'Agent_current',
          position: { x: 0, y: 0 },
          entity: {
            key: 'Agent_current',
            name: 'Support Expert'
          }
        }
      ],
      connections: []
    }
    const { service, commandBus } = createService({
      xpertService: {
        repository: {
          findOne: jest.fn().mockResolvedValue(
            buildPersistedXpert({
              id: 'xpert-graph',
              agent: {
                id: 'agent-current',
                key: 'Agent_current',
                name: 'Support Expert'
              },
              draft: currentDraft
            })
          )
        }
      }
    })

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-graph',
        baseDraftHash: (service as any).calculateDraftHash(currentDraft)
      },
      {
        dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_imported
nodes:
  - type: agent
    key: Agent_imported
    position:
      x: 0
      y: 0
    entity:
      key: Agent_imported
      name: Support Expert
  - type: workflow
    key: Workflow_Code
    position:
      x: 200
      y: 0
    entity:
      key: Workflow_Code
      type: code
      title: Broken Target
connections:
  - key: Agent_imported/Workflow_Code
    from: Agent_imported
    to: Workflow_Code
    type: workflow`
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'rejected',
        toolName: 'editXpert',
        summary: expect.stringContaining('Draft validation failed')
      })
    )
    expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
  })

  it('allows editXpert to proceed when studio has unsaved local changes', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-5',
        name: 'Support Expert',
        agent: {
          key: 'Agent_1'
        }
      },
      nodes: [],
      connections: []
    }
    const { service, commandBus, xpertService } = createService({
      xpertService: {
        repository: {
          findOne: jest.fn().mockResolvedValue(
            buildPersistedXpert({
              id: 'xpert-5',
              draft: currentDraft
            })
          )
        }
      }
    })

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-5',
        baseDraftHash: (service as any).calculateDraftHash(currentDraft),
        unsaved: true
      },
      {
        dslYaml: `team:
  name: Updated Expert
  type: agent
  agent:
    key: Agent_1
nodes: []
connections: []`
      }
    )

    expect(xpertService.repository.findOne).toHaveBeenCalled()
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          targetXpertId: 'xpert-5'
        }
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        status: 'applied',
        toolName: 'editXpert'
      })
    )
  })

  it('allows editXpert to proceed when baseDraftHash is stale', async () => {
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
    const { service, commandBus } = createService({
      xpertService: {
        repository: {
          findOne: jest.fn().mockResolvedValue(
            buildPersistedXpert({
              id: 'xpert-6',
              draft: currentDraft
            })
          )
        }
      }
    })
    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-6',
        baseDraftHash: 'stale-hash'
      },
      {
        dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
      }
    )

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          targetXpertId: 'xpert-6'
        }
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        status: 'applied',
        toolName: 'editXpert'
      })
    )
  })

  it('allows editXpert to proceed when baseDraftHash is missing', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-6b',
        agent: {
          key: 'Agent_1'
        }
      },
      nodes: [],
      connections: []
    }
    const { service, commandBus } = createService({
      xpertService: {
        repository: {
          findOne: jest.fn().mockResolvedValue(
            buildPersistedXpert({
              id: 'xpert-6b',
              draft: currentDraft
            })
          )
        }
      }
    })

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-6b'
      },
      {
        dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
      }
    )

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          targetXpertId: 'xpert-6b'
        }
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        status: 'applied',
        toolName: 'editXpert'
      })
    )
  })

  it('imports yaml dsl into the current xpert and returns normalized yaml', async () => {
    const currentDraft = {
      team: {
        id: 'xpert-7',
        name: 'Support Expert',
        title: 'Support Expert',
        agent: {
          key: 'Agent_full'
        }
      },
      nodes: [
        {
          type: 'agent',
          key: 'Agent_full',
          position: { x: 0, y: 0 },
          entity: {
            key: 'Agent_full',
            name: 'Support Expert'
          }
        }
      ],
      connections: []
    }
    const persistedXpert = buildPersistedXpert({
      id: 'xpert-7',
      draft: currentDraft
    })
    const commandBus = {
      execute: jest.fn().mockImplementation((command) => {
        if (command instanceof XpertImportCommand) {
          return Promise.resolve(persistedXpert)
        }

        if (command instanceof XpertExportCommand) {
          return Promise.resolve({
            team: {
              id: 'xpert-7',
              name: 'Updated Expert',
              title: 'Updated Expert',
              agent: {
                key: 'Agent_full'
              }
            },
            nodes: [
              {
                type: 'agent',
                key: 'Agent_full',
                entity: {
                  key: 'Agent_full',
                  name: 'Updated Expert',
                  prompt: 'Updated prompt'
                }
              }
            ],
            connections: []
          })
        }

        return Promise.resolve(persistedXpert)
      })
    }
    const { service } = createService({
      xpertService: {
        repository: {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(persistedXpert)
            .mockResolvedValueOnce({
              ...persistedXpert,
              draft: {
                ...currentDraft,
                team: {
                  ...currentDraft.team,
                  name: 'Updated Expert',
                  title: 'Updated Expert',
                  description: 'Updated description',
                  agent: {
                    key: 'Agent_full',
                    name: 'Updated Expert',
                    prompt: 'Updated prompt'
                  }
                }
              }
            })
        }
      },
      commandBus
    })

    const result = await service.editXpertFromContext(
      {
        targetXpertId: 'xpert-7',
        baseDraftHash: (service as any).calculateDraftHash(currentDraft)
      },
      {
        dslYaml: `team:
  name: Updated Expert
  type: agent
  agent:
    key: Agent_imported
nodes:
  - type: agent
    key: Agent_imported
    entity:
      key: Agent_imported
      name: Updated Expert
      prompt: Updated prompt
connections: []`
      }
    )

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          targetXpertId: 'xpert-7'
        }
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        status: 'applied',
        toolName: 'editXpert',
        dslYaml: expect.stringContaining('Updated Expert')
      })
    )
  })
})
