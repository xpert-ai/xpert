import { IWFNTrigger, TXpertTeamDraft, WorkflowNodeTypeEnum, XpertParameterTypeEnum } from '@xpert-ai/contracts'
import { WorkflowTriggerProviderOption } from './workflow-trigger-provider-option'
import {
  applyChatTriggerInputParametersToDraft,
  createChatTriggerInputParameters,
  deriveChatTriggerInputParametersFromDraft,
  readTriggerEditorItemsFromDraft,
  upsertTriggerEditorItemsIntoDraft,
  XPERT_DRAFT_PRIMARY_AGENT_NODE_MISSING,
  XpertDraftTriggerEditorItem
} from './xpert-draft-trigger.util'

function createProvider(name: string): WorkflowTriggerProviderOption {
  return {
    name,
    label: {
      en_US: name,
      zh_Hans: name
    }
  }
}

function createDraft(overrides?: Partial<TXpertTeamDraft>): TXpertTeamDraft {
  return {
    team: {
      id: 'xpert-1',
      agent: {
        key: 'agent-1'
      }
    } as TXpertTeamDraft['team'],
    nodes: [
      {
        key: 'agent-1',
        type: 'agent',
        position: { x: 320, y: 160 },
        entity: {
          id: 'agent-1',
          key: 'agent-1'
        }
      } as TXpertTeamDraft['nodes'][number],
      {
        key: 'trigger-existing',
        type: 'workflow',
        position: { x: 40, y: 160 },
        entity: {
          id: 'trigger-existing',
          key: 'trigger-existing',
          type: WorkflowNodeTypeEnum.TRIGGER,
          title: 'scheduler',
          from: 'scheduler',
          config: {
            cron: '0 0 * * *'
          }
        }
      } as TXpertTeamDraft['nodes'][number],
      {
        key: 'trigger-chat',
        type: 'workflow',
        position: { x: 40, y: 40 },
        entity: {
          id: 'trigger-chat',
          key: 'trigger-chat',
          type: WorkflowNodeTypeEnum.TRIGGER,
          title: 'Chat',
          from: 'chat'
        }
      } as TXpertTeamDraft['nodes'][number]
    ],
    connections: [
      {
        key: 'trigger-existing/agent-1',
        type: 'edge',
        from: 'trigger-existing',
        to: 'agent-1'
      }
    ],
    ...overrides
  }
}

function createTriggerItem(
  nodeKey: string,
  provider: string,
  config?: Record<string, unknown>
): XpertDraftTriggerEditorItem {
  return {
    nodeKey,
    provider: createProvider(provider),
    config
  }
}

function addChatTriggerParameter(draft: TXpertTeamDraft) {
  const chatTriggerNode = draft.nodes.find((node) => node.key === 'trigger-chat')
  if (
    !chatTriggerNode ||
    chatTriggerNode.type !== 'workflow' ||
    chatTriggerNode.entity.type !== WorkflowNodeTypeEnum.TRIGGER
  ) {
    throw new Error('Chat trigger node missing')
  }

  const chatTrigger = chatTriggerNode.entity as IWFNTrigger
  chatTriggerNode.entity = {
    ...chatTrigger,
    parameters: [
      {
        type: XpertParameterTypeEnum.TEXT,
        name: 'topic'
      }
    ]
  }
}

describe('xpert draft trigger util', () => {
  it('creates chat trigger input parameters as a channel object group', () => {
    expect(
      createChatTriggerInputParameters('trigger-chat', [
        {
          type: XpertParameterTypeEnum.TEXT,
          name: 'topic'
        }
      ])
    ).toEqual([
      {
        type: XpertParameterTypeEnum.OBJECT,
        name: 'trigger-chat_channel',
        optional: true,
        item: [
          {
            type: XpertParameterTypeEnum.TEXT,
            name: 'topic'
          }
        ]
      }
    ])
  })

  it('derives chat trigger input parameters from draft', () => {
    const draft = createDraft()
    addChatTriggerParameter(draft)

    expect(deriveChatTriggerInputParametersFromDraft(draft)).toEqual([
      {
        type: XpertParameterTypeEnum.OBJECT,
        name: 'trigger-chat_channel',
        optional: true,
        item: [
          {
            type: XpertParameterTypeEnum.TEXT,
            name: 'topic'
          }
        ]
      }
    ])
  })

  it('uses chat trigger parameters to overwrite existing team agent config parameters', () => {
    const draft = createDraft({
      team: {
        id: 'xpert-1',
        agent: {
          key: 'agent-1'
        },
        agentConfig: {
          parameters: [
            {
              type: XpertParameterTypeEnum.TEXT,
              name: 'agentParam'
            }
          ]
        }
      } as TXpertTeamDraft['team']
    })
    addChatTriggerParameter(draft)

    expect(applyChatTriggerInputParametersToDraft(draft).team.agentConfig?.parameters).toEqual([
      {
        type: XpertParameterTypeEnum.OBJECT,
        name: 'trigger-chat_channel',
        optional: true,
        item: [
          {
            type: XpertParameterTypeEnum.TEXT,
            name: 'topic'
          }
        ]
      }
    ])
  })

  it('removes stale chat trigger input parameters when chat trigger has no parameters', () => {
    const draft = createDraft({
      team: {
        id: 'xpert-1',
        agent: {
          key: 'agent-1'
        },
        agentConfig: {
          parameters: [
            {
              type: XpertParameterTypeEnum.OBJECT,
              name: 'trigger-chat_channel',
              optional: true,
              item: [
                {
                  type: XpertParameterTypeEnum.TEXT,
                  name: 'topic'
                }
              ]
            }
          ]
        }
      } as TXpertTeamDraft['team']
    })

    expect(applyChatTriggerInputParametersToDraft(draft).team.agentConfig?.parameters).toBeNull()
  })

  it('keeps non-trigger input parameters when removing stale chat trigger parameters', () => {
    const draft = createDraft({
      team: {
        id: 'xpert-1',
        agent: {
          key: 'agent-1'
        },
        agentConfig: {
          parameters: [
            {
              type: XpertParameterTypeEnum.TEXT,
              name: 'agentParam'
            },
            {
              type: XpertParameterTypeEnum.OBJECT,
              name: 'trigger-chat_channel',
              optional: true,
              item: [
                {
                  type: XpertParameterTypeEnum.TEXT,
                  name: 'topic'
                }
              ]
            }
          ]
        }
      } as TXpertTeamDraft['team']
    })

    expect(applyChatTriggerInputParametersToDraft(draft).team.agentConfig?.parameters).toEqual([
      {
        type: XpertParameterTypeEnum.TEXT,
        name: 'agentParam'
      }
    ])
  })

  it('reads non-chat trigger editor items from draft', () => {
    const draft = createDraft()

    const items = readTriggerEditorItemsFromDraft(draft, [createProvider('scheduler')])

    expect(items).toEqual([
      {
        nodeKey: 'trigger-existing',
        provider: createProvider('scheduler'),
        config: {
          cron: '0 0 * * *'
        }
      }
    ])
    ;(items[0].config as Record<string, unknown>).cron = 'changed'
    expect(((draft.nodes[1].entity as any).config ?? {}).cron).toBe('0 0 * * *')
  })

  it('upserts trigger editor items back into draft', () => {
    const draft = createDraft()

    const nextDraft = upsertTriggerEditorItemsIntoDraft(draft, [
      createTriggerItem('trigger-existing', 'scheduler', { cron: '0 15 * * *' }),
      createTriggerItem('trigger-new', 'webhook', { url: 'https://example.com/hook' })
    ])

    const existingTrigger = nextDraft.nodes.find((node) => node.key === 'trigger-existing')
    const newTrigger = nextDraft.nodes.find((node) => node.key === 'trigger-new')

    expect((existingTrigger?.entity as any).config).toEqual({ cron: '0 15 * * *' })
    expect(newTrigger).toEqual(
      expect.objectContaining({
        key: 'trigger-new',
        type: 'workflow',
        position: { x: 40, y: 280 },
        entity: expect.objectContaining({
          type: WorkflowNodeTypeEnum.TRIGGER,
          from: 'webhook',
          title: 'webhook',
          config: {
            url: 'https://example.com/hook'
          }
        })
      })
    )
    expect(nextDraft.connections).toContainEqual({
      key: 'trigger-new/agent-1',
      type: 'edge',
      from: 'trigger-new',
      to: 'agent-1'
    })
    expect((draft.nodes[1].entity as any).config).toEqual({ cron: '0 0 * * *' })
  })

  it('throws when appending a new trigger without a primary agent node', () => {
    const draft = createDraft({
      team: {
        id: 'xpert-1',
        agent: {
          key: 'missing-agent'
        }
      } as TXpertTeamDraft['team']
    })

    expect(() =>
      upsertTriggerEditorItemsIntoDraft(draft, [
        createTriggerItem('trigger-new', 'webhook', { url: 'https://example.com/hook' })
      ])
    ).toThrow(XPERT_DRAFT_PRIMARY_AGENT_NODE_MISSING)
  })
})
