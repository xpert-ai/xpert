import { IXpert, WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import {
  BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
  BLANK_WORKFLOW_NODE_ORDER,
  buildBlankKnowledgeDraft,
  buildBlankWorkflowDraft,
  buildBlankXpertDraft,
  hasBlankWizardSelections,
  normalizeBlankTriggerSelections,
  normalizeKnowledgeBlankWizardSelections,
  normalizeBlankWizardSelections,
  normalizeWorkflowBlankWizardSelections
} from './blank-draft.util'

describe('blank draft util', () => {
  const createXpert = (): IXpert =>
    ({
      id: 'xpert-1',
      name: 'blank-expert',
      slug: 'blank-expert',
      type: XpertTypeEnum.Agent,
      title: 'Blank Expert',
      latest: true,
      workspaceId: 'workspace-1',
      agent: {
        id: 'agent-1',
        key: 'Agent_primary',
        name: 'primary-agent',
        title: 'Primary Agent',
        options: {
          vision: {
            enabled: true
          }
        }
      }
    }) as IXpert

  const createKnowledgeXpert = (): IXpert =>
    ({
      id: 'xpert-kb-1',
      name: 'blank-knowledge-pipeline',
      slug: 'blank-knowledge-pipeline',
      type: XpertTypeEnum.Knowledge,
      title: 'Blank Knowledge Pipeline',
      latest: true,
      workspaceId: 'workspace-1',
      agent: {
        id: 'agent-kb-1',
        key: 'Agent_pipeline',
        name: 'pipeline-agent',
        title: 'Pipeline Agent',
        options: {
          hidden: true
        }
      }
    }) as IXpert

  it('should normalize and detect selections', () => {
    expect(
      normalizeBlankWizardSelections({
        triggers: [
          { provider: 'chat' },
          { provider: 'chat', config: { enabled: true } },
          { provider: '  scheduler  ', config: { enabled: true, cron: '0 * * * *' } }
        ],
        skills: ['Skill A', ' ', 'Skill A'],
        middlewares: ['guard', 'guard']
      })
    ).toEqual({
      triggers: [
        { provider: 'chat', config: { enabled: true } },
        { provider: 'scheduler', config: { enabled: true, cron: '0 * * * *' } }
      ],
      triggerProviders: [],
      skills: ['Skill A'],
      middlewares: ['guard', BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER]
    })

    expect(hasBlankWizardSelections()).toBe(false)
    expect(hasBlankWizardSelections({ skills: ['Skill A'] })).toBe(true)
    expect(
      normalizeBlankWizardSelections({
        middlewares: ['guard', BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER]
      })
    ).toEqual({
      triggers: [],
      triggerProviders: [],
      skills: [],
      middlewares: ['guard']
    })
    expect(
      normalizeBlankTriggerSelections(
        [
          { provider: 'schedule', config: { enabled: true, cron: '0 * * * *' } },
          { provider: 'schedule', config: { enabled: false } }
        ],
        ['chat']
      )
    ).toEqual([{ provider: 'schedule', config: { enabled: false } }, { provider: 'chat' }])

    expect(
      normalizeKnowledgeBlankWizardSelections({
        triggers: [{ provider: ' chat ' }, { provider: 'chat' }],
        sourceProviders: ['source'],
        processorProviders: ['   '],
        chunkerProviders: [],
        understandingProviders: ['vision']
      })
    ).toEqual({
      triggers: [{ provider: 'chat' }],
      triggerProviders: [],
      sourceProviders: ['source'],
      processorProviders: [],
      chunkerProviders: [],
      understandingProviders: ['vision']
    })

    expect(
      normalizeWorkflowBlankWizardSelections({
        nodes: ['answer', 'http', 'answer', 'knowledge', 'invalid' as any]
      })
    ).toEqual({
      nodes: BLANK_WORKFLOW_NODE_ORDER.filter((node) => ['answer', 'http', 'knowledge'].includes(node))
    })
  })

  it('should keep the base draft when no extra selections are provided', async () => {
    const draft = await buildBlankXpertDraft(createXpert())

    expect(draft.nodes).toHaveLength(1)
    expect(draft.nodes[0].key).toBe('Agent_primary')
    expect(draft.connections).toHaveLength(0)
    expect(draft.team.agent.options?.middlewares).toBeUndefined()
  })

  it('should append trigger and middleware nodes and enable skills through skills middleware', async () => {
    const draft = await buildBlankXpertDraft(createXpert(), {
      triggers: [{ provider: 'schedule', config: { enabled: true, cron: '0 * * * *', task: 'Ping' } }],
      skills: ['Skill A', 'Skill B'],
      middlewares: ['guard', 'audit']
    })

    const workflowNodes = draft.nodes.filter((node) => node.type === 'workflow')
    const triggerNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.TRIGGER)
    const middlewareNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE)
    const skillsMiddlewareNode = middlewareNodes.find(
      (node) => (node.entity as any).provider === BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER
    )

    expect(triggerNodes).toHaveLength(1)
    expect(workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.SKILL)).toHaveLength(0)
    expect(middlewareNodes).toHaveLength(3)
    expect(skillsMiddlewareNode).toBeDefined()
    expect((triggerNodes[0].entity as any).config).toEqual({ enabled: true, cron: '0 * * * *', task: 'Ping' })
    expect((skillsMiddlewareNode!.entity as any).options).toEqual({
      skills: ['Skill A', 'Skill B']
    })

    expect(draft.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'edge',
          from: triggerNodes[0].key,
          to: 'Agent_primary'
        }),
        expect.objectContaining({
          type: 'workflow',
          from: 'Agent_primary',
          to: skillsMiddlewareNode!.key
        }),
        expect.objectContaining({
          type: 'workflow',
          from: 'Agent_primary',
          to: middlewareNodes[0].key
        })
      ])
    )

    const primaryAgentNode = draft.nodes.find((node) => node.key === 'Agent_primary')!
    expect(triggerNodes[0].position.x).toBeLessThan(primaryAgentNode.position.x)
    expect(skillsMiddlewareNode!.position.y).toBeGreaterThan(primaryAgentNode.position.y)
    expect(middlewareNodes[0].position.y).toBeGreaterThan(primaryAgentNode.position.y)
    expect(draft.team.agent.options.middlewares.order).toEqual(middlewareNodes.map((node) => node.key))
  })

  it('should create a knowledge pipeline draft with a default knowledge base node', async () => {
    const draft = await buildBlankKnowledgeDraft(createKnowledgeXpert())
    const knowledgeBaseNode = draft.nodes[0]

    expect(draft.nodes).toHaveLength(1)
    expect(knowledgeBaseNode.type).toBe('workflow')
    if (knowledgeBaseNode.type !== 'workflow') {
      throw new Error('Expected a workflow node')
    }
    expect(knowledgeBaseNode.entity.type).toBe(WorkflowNodeTypeEnum.KNOWLEDGE_BASE)
    expect(draft.connections).toHaveLength(0)
    expect(draft.team.agent.options.hidden).toBe(true)
  })

  it('should create a linear knowledge pipeline in the requested step order', async () => {
    const draft = await buildBlankKnowledgeDraft(createKnowledgeXpert(), {
      triggers: [{ provider: 'schedule', config: { enabled: true, cron: '0 * * * *', task: 'Sync documents' } }],
      sourceProviders: ['local-file'],
      processorProviders: ['markdown-cleaner'],
      chunkerProviders: ['recursive-text-splitter'],
      understandingProviders: ['vision-parser']
    })

    const workflowNodes = draft.nodes.filter((node) => node.type === 'workflow')
    expect(workflowNodes.map((node) => node.entity.type)).toEqual([
      WorkflowNodeTypeEnum.TRIGGER,
      WorkflowNodeTypeEnum.SOURCE,
      WorkflowNodeTypeEnum.PROCESSOR,
      WorkflowNodeTypeEnum.CHUNKER,
      WorkflowNodeTypeEnum.UNDERSTANDING,
      WorkflowNodeTypeEnum.KNOWLEDGE_BASE
    ])
    expect((workflowNodes[0].entity as any).config).toEqual({
      enabled: true,
      cron: '0 * * * *',
      task: 'Sync documents'
    })

    expect(draft.connections).toHaveLength(5)
    expect(draft.connections.every((connection) => connection.type === 'edge')).toBe(true)
    expect(draft.connections.map((connection) => `${connection.from}->${connection.to}`)).toEqual(
      workflowNodes.slice(0, -1).map((node, index) => `${node.key}->${workflowNodes[index + 1].key}`)
    )
  })

  it('should support multiple nodes within the same knowledge pipeline stage', async () => {
    const draft = await buildBlankKnowledgeDraft(createKnowledgeXpert(), {
      triggers: [
        { provider: 'chat' },
        { provider: 'schedule', config: { enabled: true, cron: '0 * * * *', task: 'Refresh knowledge' } }
      ],
      sourceProviders: ['local-file', 'web-loader'],
      processorProviders: ['markdown-cleaner'],
      chunkerProviders: ['recursive-text-splitter', 'token-splitter'],
      understandingProviders: []
    })

    const workflowNodes = draft.nodes.filter((node) => node.type === 'workflow')
    const triggerNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.TRIGGER)
    const sourceNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.SOURCE)
    const kbNode = workflowNodes.find((node) => node.entity.type === WorkflowNodeTypeEnum.KNOWLEDGE_BASE)

    expect(triggerNodes).toHaveLength(2)
    expect(sourceNodes).toHaveLength(2)
    expect(kbNode).toBeDefined()
    expect((triggerNodes.find((node) => (node.entity as any).from === 'schedule')?.entity as any)?.config).toEqual({
      enabled: true,
      cron: '0 * * * *',
      task: 'Refresh knowledge'
    })
    expect(
      draft.connections.filter((connection) => triggerNodes.some((node) => node.key === connection.from))
    ).toHaveLength(4)
    expect(draft.connections.filter((connection) => connection.to === kbNode!.key)).toHaveLength(2)
  })

  it('should create a pure workflow starter with a default chat trigger', async () => {
    const draft = await buildBlankWorkflowDraft(createXpert())
    const triggerNode = draft.nodes[0]

    expect(draft.team.agent.options.hidden).toBe(true)
    expect(draft.nodes).toHaveLength(1)
    expect(draft.nodes.every((node) => node.type === 'workflow')).toBe(true)
    if (triggerNode.type !== 'workflow') {
      throw new Error('Expected a workflow trigger node')
    }
    expect(triggerNode.entity.type).toBe(WorkflowNodeTypeEnum.TRIGGER)
    expect((triggerNode.entity as any).from).toBe('chat')
    expect(draft.connections).toHaveLength(0)
  })

  it('should create the selected workflow starter nodes in the fixed linear order', async () => {
    const draft = await buildBlankWorkflowDraft(createXpert(), {
      nodes: ['answer', 'http', 'knowledge', 'code', 'answer']
    })

    const workflowNodes = draft.nodes.filter((node) => node.type === 'workflow')
    expect(workflowNodes.map((node) => node.entity.type)).toEqual([
      WorkflowNodeTypeEnum.TRIGGER,
      WorkflowNodeTypeEnum.KNOWLEDGE,
      WorkflowNodeTypeEnum.HTTP,
      WorkflowNodeTypeEnum.CODE,
      WorkflowNodeTypeEnum.ANSWER
    ])

    expect(draft.connections).toHaveLength(4)
    expect(draft.connections.every((connection) => connection.type === 'edge')).toBe(true)
    expect(draft.connections.map((connection) => `${connection.from}->${connection.to}`)).toEqual(
      workflowNodes.slice(0, -1).map((node, index) => `${node.key}->${workflowNodes[index + 1].key}`)
    )
    expect(workflowNodes.map((node) => node.position.x)).toEqual([0, 320, 640, 960, 1280])
  })
})
