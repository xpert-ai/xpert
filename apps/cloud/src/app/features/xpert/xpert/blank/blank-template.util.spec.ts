import { TXpertTeamDraft, WorkflowNodeTypeEnum, XpertTypeEnum } from '@metad/contracts'
import {
  applyAgentTemplateWizardState,
  applyKnowledgeTemplateWizardState,
  extractAgentTemplateWizardState,
  extractKnowledgeTemplateWizardState
} from './blank-template.util'

describe('blank template util', () => {
  function createAgentTemplateDraft(): TXpertTeamDraft {
    return {
      team: {
        id: 'template-agent',
        name: 'template-agent',
        type: XpertTypeEnum.Agent,
        title: 'Template Agent',
        description: 'Agent template description',
        avatar: {
          emoji: {
            id: 'robot_face'
          },
          background: 'rgb(213, 245, 246)'
        },
        copilotModel: {
          modelType: 'llm',
          model: 'gpt-4o'
        } as any,
        agent: {
          key: 'Agent_primary',
          options: {
            middlewares: {
              order: ['Middleware_guard', 'Middleware_audit']
            }
          }
        } as any
      },
      nodes: [
        {
          type: 'agent',
          key: 'Agent_primary',
          position: { x: 360, y: 220 },
          entity: {
            key: 'Agent_primary'
          } as any
        },
        {
          type: 'workflow',
          key: 'Trigger_chat',
          position: { x: 120, y: 160 },
          entity: {
            key: 'Trigger_chat',
            type: WorkflowNodeTypeEnum.TRIGGER,
            from: 'chat',
            title: 'Chat'
          } as any
        },
        {
          type: 'workflow',
          key: 'Trigger_schedule',
          position: { x: 120, y: 280 },
          entity: {
            key: 'Trigger_schedule',
            type: WorkflowNodeTypeEnum.TRIGGER,
            from: 'schedule',
            title: 'Schedule',
            config: {
              cron: '0 * * * *'
            }
          } as any
        },
        {
          type: 'workflow',
          key: 'Skill_writer',
          position: { x: 620, y: 180 },
          entity: {
            key: 'Skill_writer',
            type: WorkflowNodeTypeEnum.SKILL,
            title: 'writer',
            skills: ['writer']
          } as any
        },
        {
          type: 'workflow',
          key: 'Middleware_guard',
          position: { x: 360, y: 440 },
          entity: {
            key: 'Middleware_guard',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            title: 'guard',
            provider: 'guard'
          } as any
        },
        {
          type: 'workflow',
          key: 'Middleware_audit',
          position: { x: 360, y: 560 },
          entity: {
            key: 'Middleware_audit',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            title: 'audit',
            provider: 'audit'
          } as any
        },
        {
          type: 'workflow',
          key: 'Answer_keep',
          position: { x: 860, y: 220 },
          entity: {
            key: 'Answer_keep',
            type: WorkflowNodeTypeEnum.ANSWER,
            title: 'Answer'
          } as any
        }
      ],
      connections: [
        {
          key: 'Trigger_chat/Agent_primary',
          type: 'edge',
          from: 'Trigger_chat',
          to: 'Agent_primary'
        },
        {
          key: 'Trigger_schedule/Agent_primary',
          type: 'edge',
          from: 'Trigger_schedule',
          to: 'Agent_primary'
        },
        {
          key: 'Agent_primary/Skill_writer',
          type: 'workflow',
          from: 'Agent_primary',
          to: 'Skill_writer'
        },
        {
          key: 'Agent_primary/Middleware_guard',
          type: 'workflow',
          from: 'Agent_primary',
          to: 'Middleware_guard'
        },
        {
          key: 'Agent_primary/Middleware_audit',
          type: 'workflow',
          from: 'Agent_primary',
          to: 'Middleware_audit'
        },
        {
          key: 'Agent_primary/Answer_keep',
          type: 'edge',
          from: 'Agent_primary',
          to: 'Answer_keep'
        }
      ]
    }
  }

  function createKnowledgeTemplateDraft(): TXpertTeamDraft {
    return {
      team: {
        id: 'template-knowledge',
        name: 'template-knowledge',
        type: XpertTypeEnum.Knowledge,
        title: 'Template Knowledge',
        description: 'Knowledge template description',
        agent: {
          key: 'Agent_pipeline',
          options: {
            hidden: true
          }
        } as any
      },
      nodes: [
        {
          type: 'workflow',
          key: 'Trigger_schedule',
          position: { x: 0, y: 240 },
          entity: {
            key: 'Trigger_schedule',
            type: WorkflowNodeTypeEnum.TRIGGER,
            from: 'schedule',
            title: 'Schedule',
            config: {
              cron: '0 * * * *'
            }
          } as any
        },
        {
          type: 'workflow',
          key: 'Source_local',
          position: { x: 320, y: 240 },
          entity: {
            key: 'Source_local',
            type: WorkflowNodeTypeEnum.SOURCE,
            title: 'Local File',
            provider: 'local-file',
            config: {}
          } as any
        },
        {
          type: 'workflow',
          key: 'Processor_default',
          position: { x: 640, y: 240 },
          entity: {
            key: 'Processor_default',
            type: WorkflowNodeTypeEnum.PROCESSOR,
            title: 'Default Processor',
            provider: 'default',
            config: {},
            input: ''
          } as any
        },
        {
          type: 'workflow',
          key: 'Chunker_recursive',
          position: { x: 960, y: 240 },
          entity: {
            key: 'Chunker_recursive',
            type: WorkflowNodeTypeEnum.CHUNKER,
            title: 'Recursive Chunker',
            provider: 'recursive-character',
            config: {
              chunkSize: 1000
            },
            input: ''
          } as any
        },
        {
          type: 'workflow',
          key: 'Understanding_vision',
          position: { x: 1280, y: 240 },
          entity: {
            key: 'Understanding_vision',
            type: WorkflowNodeTypeEnum.UNDERSTANDING,
            title: 'Vision',
            provider: 'vision-parser',
            config: {},
            input: ''
          } as any
        },
        {
          type: 'workflow',
          key: 'KnowledgeBase_primary',
          position: { x: 1600, y: 240 },
          entity: {
            key: 'KnowledgeBase_primary',
            type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
            title: 'Knowledge Base'
          } as any
        },
        {
          type: 'workflow',
          key: 'Answer_keep',
          position: { x: 1120, y: 20 },
          entity: {
            key: 'Answer_keep',
            type: WorkflowNodeTypeEnum.ANSWER,
            title: 'Keep me'
          } as any
        }
      ],
      connections: [
        {
          key: 'Trigger_schedule/Source_local',
          type: 'edge',
          from: 'Trigger_schedule',
          to: 'Source_local'
        },
        {
          key: 'Source_local/Processor_default',
          type: 'edge',
          from: 'Source_local',
          to: 'Processor_default'
        },
        {
          key: 'Processor_default/Chunker_recursive',
          type: 'edge',
          from: 'Processor_default',
          to: 'Chunker_recursive'
        },
        {
          key: 'Chunker_recursive/Understanding_vision',
          type: 'edge',
          from: 'Chunker_recursive',
          to: 'Understanding_vision'
        },
        {
          key: 'Understanding_vision/KnowledgeBase_primary',
          type: 'edge',
          from: 'Understanding_vision',
          to: 'KnowledgeBase_primary'
        }
      ]
    }
  }

  it('extracts supported agent template nodes into blank wizard state', () => {
    const state = extractAgentTemplateWizardState(createAgentTemplateDraft())

    expect(state.basic).toEqual(
      expect.objectContaining({
        name: 'template-agent',
        title: 'Template Agent',
        description: 'Agent template description'
      })
    )
    expect(state.selections.triggers).toEqual([
      { provider: 'chat' },
      {
        provider: 'schedule',
        config: {
          cron: '0 * * * *'
        }
      }
    ])
    expect(state.selections.skills).toEqual(['writer'])
    expect(state.selections.middlewares).toEqual(['guard', 'audit'])
  })

  it('extracts supported knowledge template nodes into blank wizard state', () => {
    const state = extractKnowledgeTemplateWizardState(createKnowledgeTemplateDraft())

    expect(state.basic).toEqual(
      expect.objectContaining({
        name: 'template-knowledge',
        title: 'Template Knowledge',
        description: 'Knowledge template description'
      })
    )
    expect(state.selections.triggers).toEqual([
      {
        provider: 'schedule',
        config: {
          cron: '0 * * * *'
        }
      }
    ])
    expect(state.selections.sourceProviders).toEqual(['local-file'])
    expect(state.selections.processorProviders).toEqual(['default'])
    expect(state.selections.chunkerProviders).toEqual(['recursive-character'])
    expect(state.selections.understandingProviders).toEqual(['vision-parser'])
  })

  it('applies agent wizard selections back onto the template while preserving unsupported nodes', () => {
    const result = applyAgentTemplateWizardState(createAgentTemplateDraft(), {
      triggers: [
        { provider: 'chat' },
        {
          provider: 'schedule',
          config: {
            cron: '0 0 * * *',
            timezone: 'UTC'
          }
        }
      ],
      skills: ['rewriter'],
      middlewares: ['guard']
    })

    const workflowNodes = result.nodes.filter((node) => node.type === 'workflow')
    const triggerNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.TRIGGER)
    const skillNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.SKILL)
    const middlewareNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE)

    expect(triggerNodes).toHaveLength(2)
    expect((triggerNodes.find((node) => (node.entity as any).from === 'schedule')?.entity as any)?.config).toEqual({
      cron: '0 0 * * *',
      timezone: 'UTC'
    })
    expect(skillNodes).toHaveLength(1)
    expect(skillNodes[0].entity.title).toBe('rewriter')
    expect(middlewareNodes).toHaveLength(1)
    expect((middlewareNodes[0].entity as any).provider).toBe('guard')
    expect(result.nodes.some((node) => node.key === 'Answer_keep')).toBe(true)
    expect(result.nodes.some((node) => node.key === 'Middleware_audit')).toBe(false)
    expect(result.team.agent?.options?.middlewares?.order).toEqual([middlewareNodes[0].key])
  })

  it('applies knowledge wizard selections back onto the template while preserving unsupported nodes', () => {
    const result = applyKnowledgeTemplateWizardState(createKnowledgeTemplateDraft(), {
      triggers: [
        {
          provider: 'schedule',
          config: {
            cron: '0 12 * * *'
          }
        }
      ],
      sourceProviders: ['web-loader'],
      processorProviders: ['markdown-cleaner'],
      chunkerProviders: ['recursive-text-splitter'],
      understandingProviders: []
    })

    const workflowNodes = result.nodes.filter((node) => node.type === 'workflow')
    const triggerNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.TRIGGER)
    const sourceNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.SOURCE)
    const processorNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.PROCESSOR)
    const chunkerNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.CHUNKER)
    const understandingNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.UNDERSTANDING)
    const knowledgeBaseNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.KNOWLEDGE_BASE)

    expect(triggerNodes).toHaveLength(1)
    expect((triggerNodes[0].entity as any).config).toEqual({
      cron: '0 12 * * *'
    })
    expect(sourceNodes.map((node) => (node.entity as any).provider)).toEqual(['web-loader'])
    expect(processorNodes.map((node) => (node.entity as any).provider)).toEqual(['markdown-cleaner'])
    expect(chunkerNodes.map((node) => (node.entity as any).provider)).toEqual(['recursive-text-splitter'])
    expect(understandingNodes).toHaveLength(0)
    expect(knowledgeBaseNodes).toHaveLength(1)
    expect(result.nodes.some((node) => node.key === 'Answer_keep')).toBe(true)
    expect(
      result.connections.some(
        (connection) => connection.from === chunkerNodes[0].key && connection.to === knowledgeBaseNodes[0].key
      )
    ).toBe(true)
  })
})
