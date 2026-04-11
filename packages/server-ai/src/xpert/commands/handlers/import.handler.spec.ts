import { BadRequestException } from '@nestjs/common'

jest.mock('@xpert-ai/contracts', () => ({
  LongTermMemoryTypeEnum: {
    QA: 'qa'
  },
  convertToUrlPath: (value: string) =>
    value
      ?.trim()
      .toLowerCase()
      .replace(/\s+/g, '-'),
  mapTranslationLanguage: (value: string) => value,
  omitXpertRelations: (xpert: Record<string, any>) => {
    const { agent, agents, toolsets, knowledgebases, ...rest } = xpert
    return rest
  },
  replaceAgentInDraft: (draft: Record<string, any>, sourceKey: string, agent: Record<string, any>) => ({
    ...draft,
    team: {
      ...(draft.team ?? {}),
      agent: {
        ...(draft.team?.agent ?? {}),
        ...agent,
        key: agent.key
      }
    },
    nodes: (draft.nodes ?? []).map((node: Record<string, any>) =>
      node.type === 'agent' && node.key === sourceKey
        ? {
            ...node,
            key: agent.key,
            entity: {
              ...(node.entity ?? {}),
              ...agent,
              key: agent.key
            }
          }
        : node
    ),
    connections: (draft.connections ?? []).map((connection: Record<string, any>) => {
      const from = connection.from === sourceKey ? agent.key : connection.from
      const to = connection.to === sourceKey ? agent.key : connection.to

      return from === connection.from && to === connection.to
        ? connection
        : {
            ...connection,
            from,
            to,
            key: `${from}/${to}`
          }
    })
  })
}))

jest.mock('../../types', () => ({
  XpertNameInvalidException: class XpertNameInvalidException extends Error {}
}))

jest.mock('../../xpert.service', () => ({
  XpertService: class XpertService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
  RequestContext: {
    getLanguageCode: jest.fn().mockReturnValue('en')
  }
}))

import { XpertImportHandler } from './import.handler'
import { XpertImportCommand } from '../import.command'

describe('XpertImportHandler', () => {
  const i18n = {
    t: jest.fn().mockResolvedValue('Name invalid')
  }

  const buildHandler = (overrides: Record<string, any> = {}) => {
    const xpertService = {
      create: jest.fn().mockResolvedValue({
        id: 'new-xpert',
        name: 'Imported Expert',
        slug: 'imported-expert',
        agent: {
          id: 'agent-new',
          key: 'Agent_new',
          name: 'Imported Expert'
        }
      }),
      validateName: jest.fn().mockResolvedValue(true),
      saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
      createBulkMemories: jest.fn().mockResolvedValue(undefined),
      repository: {
        findOne: jest.fn()
      },
      ...overrides
    }

    return {
      xpertService,
      handler: new XpertImportHandler(xpertService as any, i18n as any)
    }
  }

  it('keeps the existing import behavior for creating a new xpert', async () => {
    const { handler, xpertService } = buildHandler()

    const result = await handler.execute(
      new XpertImportCommand({
        team: {
          name: 'Imported Expert',
          title: 'Imported Expert',
          type: 'agent',
          agent: {
            key: 'Agent_imported'
          }
        },
        nodes: [
          {
            type: 'agent',
            key: 'Agent_imported',
            entity: {
              key: 'Agent_imported',
              name: 'Imported Expert',
              prompt: 'Help users'
            }
          }
        ],
        connections: [],
        memories: [
          {
            prefix: 'memory:qa',
            value: {
              question: 'Hello?',
              answer: 'Hi!'
            }
          }
        ]
      } as any)
    )

    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Imported Expert'
      })
    )
    expect(xpertService.saveDraft).toHaveBeenCalledWith(
      'new-xpert',
      expect.objectContaining({
        team: expect.objectContaining({
          id: 'new-xpert'
        })
      })
    )
    expect(xpertService.createBulkMemories).toHaveBeenCalledWith('new-xpert', {
      type: 'qa',
      memories: [
        {
          question: 'Hello?',
          answer: 'Hi!'
        }
      ]
    })
    expect(result.id).toBe('new-xpert')
  })

  it('overwrites the current xpert draft without creating a new xpert', async () => {
    const currentXpert = {
      id: 'xpert-1',
      name: 'Support Expert',
      title: 'Support Expert',
      slug: 'support-expert',
      type: 'agent',
      workspaceId: 'workspace-1',
      agent: {
        id: 'agent-1',
        key: 'Agent_current',
        name: 'Support Expert',
        title: 'Support Expert',
        prompt: 'Old prompt'
      },
      draft: {
        team: {
          id: 'xpert-1',
          name: 'Support Expert',
          title: 'Support Expert',
          workspaceId: 'workspace-1',
          type: 'agent',
          agent: {
            key: 'Agent_current'
          }
        },
        nodes: [],
        connections: []
      }
    }
    const { handler, xpertService } = buildHandler({
      repository: {
        findOne: jest.fn().mockResolvedValue(currentXpert)
      }
    })

    const result = await handler.execute(
      new XpertImportCommand(
        {
          team: {
            name: 'Support Expert',
            title: 'Updated Expert',
            description: 'New description',
            type: 'agent',
            workspaceId: 'workspace-2',
            agent: {
              key: 'Agent_imported'
            }
          },
          nodes: [
            {
              type: 'agent',
              key: 'Agent_imported',
              entity: {
                key: 'Agent_imported',
                name: 'Updated Expert',
                title: 'Updated Expert',
                prompt: 'Updated prompt'
              }
            }
          ],
          connections: [],
          memories: [
            {
              prefix: 'memory:qa',
              value: {
                question: 'Ignored?',
                answer: 'Yes'
              }
            }
          ]
        } as any,
        {
          targetXpertId: 'xpert-1'
        }
      )
    )

    expect(xpertService.create).not.toHaveBeenCalled()
    expect(xpertService.validateName).not.toHaveBeenCalled()
    expect(xpertService.createBulkMemories).not.toHaveBeenCalled()
    expect(xpertService.saveDraft).toHaveBeenCalledWith(
      'xpert-1',
      expect.objectContaining({
        team: expect.objectContaining({
          id: 'xpert-1',
          workspaceId: 'workspace-1',
          name: 'Support Expert',
          title: 'Updated Expert',
          description: 'New description',
          agent: expect.objectContaining({
            id: 'agent-1',
            key: 'Agent_current',
            prompt: 'Updated prompt'
          })
        }),
        nodes: [
          expect.objectContaining({
            key: 'Agent_current',
            entity: expect.objectContaining({
              key: 'Agent_current',
              name: 'Updated Expert',
              prompt: 'Updated prompt'
            })
          })
        ]
      })
    )
    expect(result).toBe(currentXpert)
  })

  it('rejects overwrite when the dsl type does not match the current xpert', async () => {
    const { handler } = buildHandler({
      repository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'xpert-2',
          slug: 'support-expert',
          type: 'agent',
          workspaceId: 'workspace-1',
          agent: {
            key: 'Agent_current'
          }
        })
      }
    })

    await expect(
      handler.execute(
        new XpertImportCommand(
          {
            team: {
              name: 'Support Expert',
              type: 'copilot',
              agent: {
                key: 'Agent_imported'
              }
            },
            nodes: [],
            connections: []
          } as any,
          {
            targetXpertId: 'xpert-2'
          }
        )
      )
    ).rejects.toThrow('DSL type does not match the current xpert.')
  })

  it('allows keeping the same name when overwriting the current xpert', async () => {
    const { handler, xpertService } = buildHandler({
      repository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'xpert-3',
          name: 'Support Expert',
          slug: 'support-expert',
          type: 'agent',
          workspaceId: 'workspace-1',
          agent: {
            key: 'Agent_current'
          }
        })
      }
    })

    await handler.execute(
      new XpertImportCommand(
        {
          team: {
            name: 'Support Expert',
            type: 'agent',
            agent: {
              key: 'Agent_imported'
            }
          },
          nodes: [],
          connections: []
        } as any,
        {
          targetXpertId: 'xpert-3'
        }
      )
    )

    expect(xpertService.validateName).not.toHaveBeenCalled()
  })

  it('rejects overwrite when a renamed xpert collides with another name', async () => {
    const { handler, xpertService } = buildHandler({
      validateName: jest.fn().mockResolvedValue(false),
      repository: {
        findOne: jest.fn().mockResolvedValue({
          id: 'xpert-4',
          name: 'Support Expert',
          slug: 'support-expert',
          type: 'agent',
          workspaceId: 'workspace-1',
          agent: {
            key: 'Agent_current'
          }
        })
      }
    })

    await expect(
      handler.execute(
        new XpertImportCommand(
          {
            team: {
              name: 'Conflicting Expert',
              type: 'agent',
              agent: {
                key: 'Agent_imported'
              }
            },
            nodes: [],
            connections: []
          } as any,
          {
            targetXpertId: 'xpert-4'
          }
        )
      )
    ).rejects.toThrow('Name invalid')

    expect(xpertService.validateName).toHaveBeenCalledWith('Conflicting Expert')
  })

  it('rejects overwrite when the current xpert does not exist', async () => {
    const { handler } = buildHandler({
      repository: {
        findOne: jest.fn().mockResolvedValue(null)
      }
    })

    await expect(
      handler.execute(
        new XpertImportCommand(
          {
            team: {
              name: 'Support Expert',
              type: 'agent',
              agent: {
                key: 'Agent_imported'
              }
            },
            nodes: [],
            connections: []
          } as any,
          {
            targetXpertId: 'missing'
          }
        )
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
