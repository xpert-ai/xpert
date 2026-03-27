import { IXpert, WorkflowNodeTypeEnum, XpertTypeEnum } from '@metad/contracts'
import {
  BLANK_WORKFLOW_NODE_ORDER,
  buildBlankKnowledgeDraft,
  buildBlankWorkflowDraft,
  buildBlankXpertDraft,
  hasBlankWizardSelections,
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
        triggerProviders: ['chat', 'chat', '  scheduler  '],
        skills: ['Skill A', ' ', 'Skill A'],
        middlewares: ['guard', 'guard']
      })
    ).toEqual({
      triggerProviders: ['chat', 'scheduler'],
      skills: ['Skill A'],
      middlewares: ['guard']
    })

    expect(hasBlankWizardSelections()).toBe(false)
    expect(hasBlankWizardSelections({ skills: ['Skill A'] })).toBe(true)

    expect(
      normalizeKnowledgeBlankWizardSelections({
        triggerProviders: [' chat ', 'chat'],
        sourceProviders: ['source'],
        processorProviders: ['   '],
        chunkerProviders: [],
        understandingProviders: ['vision']
      })
    ).toEqual({
      triggerProviders: ['chat'],
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

  it('should append trigger, skill and middleware nodes with expected connections', async () => {
    const draft = await buildBlankXpertDraft(createXpert(), {
      triggerProviders: ['chat'],
      skills: ['Skill A', 'Skill B'],
      middlewares: ['guard', 'audit']
    })

    const workflowNodes = draft.nodes.filter((node) => node.type === 'workflow')
    const triggerNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.TRIGGER)
    const skillNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.SKILL)
    const middlewareNodes = workflowNodes.filter((node) => node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE)

    expect(triggerNodes).toHaveLength(1)
    expect(skillNodes).toHaveLength(2)
    expect(middlewareNodes).toHaveLength(2)

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
          to: skillNodes[0].key
        }),
        expect.objectContaining({
          type: 'workflow',
          from: 'Agent_primary',
          to: middlewareNodes[0].key
        })
      ])
    )

    expect(skillNodes.map((node) => node.entity.title)).toEqual(['Skill A', 'Skill B'])
    expect(
      skillNodes.map((node) => ({
        title: node.entity.title,
        skills: (node.entity as any).skills
      }))
    ).toEqual([
      { title: 'Skill A', skills: ['Skill A'] },
      { title: 'Skill B', skills: ['Skill B'] }
    ])

    const primaryAgentNode = draft.nodes.find((node) => node.key === 'Agent_primary')!
    expect(triggerNodes[0].position.x).toBeLessThan(primaryAgentNode.position.x)
    expect(skillNodes[0].position.y).toBeGreaterThan(primaryAgentNode.position.y)
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
      triggerProviders: ['chat'],
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

    expect(draft.connections).toHaveLength(5)
    expect(draft.connections.every((connection) => connection.type === 'edge')).toBe(true)
    expect(draft.connections.map((connection) => `${connection.from}->${connection.to}`)).toEqual(
      workflowNodes.slice(0, -1).map((node, index) => `${node.key}->${workflowNodes[index + 1].key}`)
    )
  })

  it('should support multiple nodes within the same knowledge pipeline stage', async () => {
    const draft = await buildBlankKnowledgeDraft(createKnowledgeXpert(), {
      triggerProviders: ['chat', 'schedule'],
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
