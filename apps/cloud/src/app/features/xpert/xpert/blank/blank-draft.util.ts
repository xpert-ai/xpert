import {
  createAgentConnections,
  createXpertNodes,
  genJSONParseKey,
  genJSONStringifyKey,
  genPipelineChunkerKey,
  genPipelineKnowledgeBaseKey,
  genPipelineProcessorKey,
  genPipelineSourceKey,
  genPipelineUnderstandingKey,
  genXpertMiddlewareKey,
  genXpertSkillKey,
  genXpertTriggerKey,
  IWFNChunker,
  IWFNCode,
  IWFNKnowledgeBase,
  IWFNKnowledgeRetrieval,
  IWFNMiddleware,
  IWFNProcessor,
  IWFNAnswer,
  IWFNAssigner,
  IWFNHttp,
  IWFNJSONParse,
  IWFNJSONStringify,
  IWFNSkill,
  IWFNSource,
  IWFNTemplate,
  IWFNTrigger,
  IWFNUnderstanding,
  IXpert,
  TXpertTeamConnection,
  TXpertTeamDraft,
  TXpertTeamNode,
  letterStartSUID,
  VariableOperationEnum,
  WorkflowNodeTypeEnum,
  XpertParameterTypeEnum
} from '@metad/contracts'
import { layoutGraphWithMixedDirection } from '../../studio/domain/layout/layout'

const HORIZONTAL_OFFSET = 280
const MIDDLEWARE_VERTICAL_OFFSET = 220
const NODE_VERTICAL_GAP = 120
const KNOWLEDGE_STAGE_X_GAP = 320
const KNOWLEDGE_STAGE_BASE_Y = 220
const WORKFLOW_STAGE_X_GAP = 320
const WORKFLOW_STAGE_BASE_Y = 0

function genWorkflowDraftKnowledgeKey() {
  return letterStartSUID('Knowledge_')
}

function genWorkflowDraftHttpKey() {
  return letterStartSUID('Http_')
}

function genWorkflowDraftCodeKey() {
  return letterStartSUID('Code_')
}

function genWorkflowDraftTemplateKey() {
  return letterStartSUID('Template_')
}

function genWorkflowDraftAssignerKey() {
  return letterStartSUID('Assigner_')
}

function genWorkflowDraftAnswerKey() {
  return letterStartSUID('Answer_')
}

export const BLANK_WORKFLOW_NODE_ORDER = [
  'knowledge',
  'http',
  'code',
  'template',
  'assigner',
  'json-parse',
  'json-stringify',
  'answer'
] as const

export type BlankWorkflowStarterNodeKey = (typeof BLANK_WORKFLOW_NODE_ORDER)[number]

export type XpertBlankWizardSelections = {
  triggerProviders?: string[]
  skills?: string[]
  middlewares?: string[]
}

export type KnowledgeBlankWizardSelections = {
  triggerProviders?: string[]
  sourceProviders?: string[]
  processorProviders?: string[]
  chunkerProviders?: string[]
  understandingProviders?: string[]
}

export type WorkflowBlankWizardSelections = {
  nodes?: BlankWorkflowStarterNodeKey[]
}

export function normalizeBlankWizardSelections(
  selections?: XpertBlankWizardSelections
): Required<XpertBlankWizardSelections> {
  return {
    triggerProviders: uniqueStrings(selections?.triggerProviders),
    skills: uniqueStrings(selections?.skills),
    middlewares: uniqueStrings(selections?.middlewares)
  }
}

export function hasBlankWizardSelections(selections?: XpertBlankWizardSelections): boolean {
  const normalized = normalizeBlankWizardSelections(selections)
  return !!(normalized.triggerProviders.length || normalized.skills.length || normalized.middlewares.length)
}

export function normalizeKnowledgeBlankWizardSelections(
  selections?: KnowledgeBlankWizardSelections
): Required<KnowledgeBlankWizardSelections> {
  return {
    triggerProviders: uniqueStrings(selections?.triggerProviders),
    sourceProviders: uniqueStrings(selections?.sourceProviders),
    processorProviders: uniqueStrings(selections?.processorProviders),
    chunkerProviders: uniqueStrings(selections?.chunkerProviders),
    understandingProviders: uniqueStrings(selections?.understandingProviders)
  }
}

export function normalizeWorkflowBlankWizardSelections(
  selections?: WorkflowBlankWizardSelections
): Required<WorkflowBlankWizardSelections> {
  const selectedNodes = new Set(uniqueStrings(selections?.nodes) as BlankWorkflowStarterNodeKey[])

  return {
    nodes: BLANK_WORKFLOW_NODE_ORDER.filter((node) => selectedNodes.has(node))
  }
}

export async function buildBlankXpertDraft(
  xpert: IXpert,
  selections?: XpertBlankWizardSelections
): Promise<TXpertTeamDraft> {
  const normalized = normalizeBlankWizardSelections(selections)
  const { agents, ...team } = xpert
  const nodes = [...createXpertNodes(xpert, { x: 0, y: 0 }).nodes]
  const connections = createBaseConnections(xpert)
  const primaryAgentKey = xpert.agent?.key
  const primaryAgentNode = nodes.find(
    (node): node is TXpertTeamNode<'agent'> => node.type === 'agent' && node.key === primaryAgentKey
  )

  if (!primaryAgentNode || !primaryAgentKey) {
    throw new Error('Primary agent node not found for blank xpert draft initialization')
  }

  const triggerNodes = createTriggerNodes(primaryAgentNode, normalized.triggerProviders)
  const skillNodes = createSkillNodes(primaryAgentNode, normalized.skills)
  const middlewareNodes = createMiddlewareNodes(primaryAgentNode, normalized.middlewares)

  nodes.push(...triggerNodes, ...skillNodes, ...middlewareNodes)
  connections.push(
    ...triggerNodes.map((node) => createConnection('edge', node.key, primaryAgentKey)),
    ...skillNodes.map((node) => createConnection('workflow', primaryAgentKey, node.key)),
    ...middlewareNodes.map((node) => createConnection('workflow', primaryAgentKey, node.key))
  )

  const draft: TXpertTeamDraft = {
    team: {
      ...team,
      agent: {
        ...xpert.agent,
        options: {
          ...(xpert.agent?.options ?? {}),
          middlewares: middlewareNodes.length
            ? {
                ...(xpert.agent?.options?.middlewares ?? {}),
                order: uniqueStrings([
                  ...(xpert.agent?.options?.middlewares?.order ?? []),
                  ...middlewareNodes.map((node) => node.key)
                ])
              }
            : xpert.agent?.options?.middlewares
        }
      }
    },
    nodes,
    connections
  }

  await layoutGraphWithMixedDirection(draft)

  return draft
}

export async function buildBlankKnowledgeDraft(
  xpert: IXpert,
  selections?: KnowledgeBlankWizardSelections
): Promise<TXpertTeamDraft> {
  const normalized = normalizeKnowledgeBlankWizardSelections(selections)
  const { agents, ...team } = xpert
  const stageGroups = createKnowledgePipelineStageGroups(normalized)
  const nodes = stageGroups.flat()
  const connections = createKnowledgePipelineConnections(stageGroups)

  const draft: TXpertTeamDraft = {
    team: {
      ...team,
      agent: {
        ...xpert.agent,
        options: {
          ...(xpert.agent?.options ?? {}),
          hidden: true
        }
      }
    },
    nodes,
    connections
  }

  return draft
}

export async function buildBlankWorkflowDraft(
  xpert: IXpert,
  selections?: WorkflowBlankWizardSelections
): Promise<TXpertTeamDraft> {
  const normalized = normalizeWorkflowBlankWizardSelections(selections)
  const { agents, ...team } = xpert
  const nodes = [createWorkflowStarterTriggerNode(), ...normalized.nodes.map((node) => createWorkflowStarterNode(node))]
  const connections = createLinearEdgeConnections(nodes)

  positionWorkflowStarterNodes(nodes)

  return {
    team: {
      ...team,
      agent: {
        ...xpert.agent,
        options: {
          ...(xpert.agent?.options ?? {}),
          hidden: true
        }
      }
    },
    nodes,
    connections
  }
}

function createBaseConnections(xpert: IXpert): TXpertTeamConnection[] {
  const connections: TXpertTeamConnection[] = []

  if (xpert.agent && !xpert.agent.options?.hidden) {
    connections.push(...createAgentConnections(xpert.agent, xpert.executors ?? []))
  }

  for (const agent of xpert.agents ?? []) {
    connections.push(...createAgentConnections(agent, xpert.executors ?? []))
  }

  return connections
}

function createTriggerNodes(
  agentNode: TXpertTeamNode<'agent'>,
  triggerProviders: string[]
): TXpertTeamNode<'workflow'>[] {
  return triggerProviders.map((provider, index, providers) => {
    const key = genXpertTriggerKey()
    return {
      type: 'workflow',
      key,
      position: {
        x: agentNode.position.x - HORIZONTAL_OFFSET,
        y: getCenteredY(agentNode.position.y, providers.length, index)
      },
      entity: {
        type: WorkflowNodeTypeEnum.TRIGGER,
        key,
        from: provider,
        title: provider === 'chat' ? 'Trigger' : provider
      } as IWFNTrigger
    }
  })
}

function createKnowledgePipelineStageGroups(
  selections: Required<KnowledgeBlankWizardSelections>
): TXpertTeamNode<'workflow'>[][] {
  const stageGroups: TXpertTeamNode<'workflow'>[][] = [
    selections.triggerProviders.map((provider) => createKnowledgeTriggerNode(provider)),
    selections.sourceProviders.map((provider) => createKnowledgeSourceNode(provider)),
    selections.processorProviders.map((provider) => createKnowledgeProcessorNode(provider)),
    selections.chunkerProviders.map((provider) => createKnowledgeChunkerNode(provider)),
    selections.understandingProviders.map((provider) => createKnowledgeUnderstandingNode(provider)),
    [createKnowledgeBaseNode()]
  ].filter((group, index) => index === 5 || group.length)

  positionKnowledgePipelineStageGroups(stageGroups)

  return stageGroups
}

function createKnowledgeTriggerNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genXpertTriggerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.TRIGGER,
      key,
      from: provider,
      title: provider === 'chat' ? 'Chat' : provider
    } as IWFNTrigger
  }
}

function createKnowledgeSourceNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineSourceKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.SOURCE,
      key,
      title: provider,
      provider,
      config: {}
    } as IWFNSource
  }
}

function createKnowledgeProcessorNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineProcessorKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.PROCESSOR,
      key,
      title: provider,
      provider,
      config: {},
      input: ''
    } as IWFNProcessor
  }
}

function createKnowledgeChunkerNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineChunkerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.CHUNKER,
      key,
      title: provider,
      provider,
      config: {},
      input: ''
    } as IWFNChunker
  }
}

function createKnowledgeUnderstandingNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineUnderstandingKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.UNDERSTANDING,
      key,
      title: provider,
      provider,
      config: {},
      input: ''
    } as IWFNUnderstanding
  }
}

function createKnowledgeBaseNode(): TXpertTeamNode<'workflow'> {
  const key = genPipelineKnowledgeBaseKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
      key,
      title: 'Knowledge Base'
    } as IWFNKnowledgeBase
  }
}

function createKnowledgePipelineConnections(stageGroups: TXpertTeamNode<'workflow'>[][]): TXpertTeamConnection[] {
  const connections: TXpertTeamConnection[] = []

  for (let index = 0; index < stageGroups.length - 1; index++) {
    const currentGroup = stageGroups[index]
    const nextGroup = stageGroups[index + 1]

    for (const currentNode of currentGroup) {
      for (const nextNode of nextGroup) {
        connections.push(createConnection('edge', currentNode.key, nextNode.key))
      }
    }
  }

  return connections
}

function createLinearEdgeConnections(nodes: TXpertTeamNode<'workflow'>[]): TXpertTeamConnection[] {
  const connections: TXpertTeamConnection[] = []

  for (let index = 0; index < nodes.length - 1; index++) {
    connections.push(createConnection('edge', nodes[index].key, nodes[index + 1].key))
  }

  return connections
}

function positionKnowledgePipelineStageGroups(stageGroups: TXpertTeamNode<'workflow'>[][]) {
  stageGroups.forEach((group, stageIndex) => {
    group.forEach((node, nodeIndex) => {
      node.position = {
        x: stageIndex * KNOWLEDGE_STAGE_X_GAP,
        y: getCenteredY(KNOWLEDGE_STAGE_BASE_Y, group.length, nodeIndex)
      }
    })
  })
}

function positionWorkflowStarterNodes(nodes: TXpertTeamNode<'workflow'>[]) {
  nodes.forEach((node, index) => {
    node.position = {
      x: index * WORKFLOW_STAGE_X_GAP,
      y: WORKFLOW_STAGE_BASE_Y
    }
  })
}

function createWorkflowStarterTriggerNode(): TXpertTeamNode<'workflow'> {
  const key = genXpertTriggerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.TRIGGER,
      key,
      from: 'chat',
      title: 'Chat'
    } as IWFNTrigger
  }
}

function createWorkflowStarterNode(node: BlankWorkflowStarterNodeKey): TXpertTeamNode<'workflow'> {
  switch (node) {
    case 'knowledge':
      return createWorkflowKnowledgeNode()
    case 'http':
      return createWorkflowHttpNode()
    case 'code':
      return createWorkflowCodeNode()
    case 'template':
      return createWorkflowTemplateNode()
    case 'assigner':
      return createWorkflowAssignerNode()
    case 'json-parse':
      return createWorkflowJSONParseNode()
    case 'json-stringify':
      return createWorkflowJSONStringifyNode()
    case 'answer':
      return createWorkflowAnswerNode()
  }
}

function createWorkflowKnowledgeNode(): TXpertTeamNode<'workflow'> {
  const key = genWorkflowDraftKnowledgeKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.KNOWLEDGE,
      key,
      title: 'Knowledge Retrieval',
      queryVariable: 'input',
      knowledgebases: []
    } as IWFNKnowledgeRetrieval
  }
}

function createWorkflowHttpNode(): TXpertTeamNode<'workflow'> {
  const key = genWorkflowDraftHttpKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.HTTP,
      key,
      title: 'HTTP Request',
      method: 'get',
      url: '',
      headers: [],
      params: [],
      body: {
        type: 'none',
        body: '',
        encodedForm: []
      }
    } as IWFNHttp
  }
}

function createWorkflowCodeNode(): TXpertTeamNode<'workflow'> {
  const key = genWorkflowDraftCodeKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.CODE,
      key,
      title: 'Code Execution',
      language: 'javascript',
      code: `return {"result": arg1 + arg2};`,
      inputs: [
        {
          name: 'arg1'
        },
        {
          name: 'arg2'
        }
      ],
      outputs: [
        {
          type: XpertParameterTypeEnum.STRING,
          name: 'result'
        }
      ]
    } as IWFNCode
  }
}

function createWorkflowTemplateNode(): TXpertTeamNode<'workflow'> {
  const key = genWorkflowDraftTemplateKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.TEMPLATE,
      key,
      title: 'Template Transform',
      code: `{{arg1}}`,
      inputParams: [
        {
          name: 'arg1',
          variable: ''
        }
      ]
    } as IWFNTemplate
  }
}

function createWorkflowAssignerNode(): TXpertTeamNode<'workflow'> {
  const key = genWorkflowDraftAssignerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.ASSIGNER,
      key,
      title: 'Variable Assigner',
      assigners: [
        {
          id: `${key}_1`,
          value: '',
          variableSelector: '',
          inputType: 'variable',
          operation: VariableOperationEnum.OVERWRITE
        }
      ]
    } as IWFNAssigner
  }
}

function createWorkflowJSONParseNode(): TXpertTeamNode<'workflow'> {
  const key = genJSONParseKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.JSON_PARSE,
      key,
      title: 'JSON Parse',
      inputVariable: ''
    } as IWFNJSONParse
  }
}

function createWorkflowJSONStringifyNode(): TXpertTeamNode<'workflow'> {
  const key = genJSONStringifyKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.JSON_STRINGIFY,
      key,
      title: 'JSON Stringify',
      inputVariable: ''
    } as IWFNJSONStringify
  }
}

function createWorkflowAnswerNode(): TXpertTeamNode<'workflow'> {
  const key = genWorkflowDraftAnswerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.ANSWER,
      key,
      title: 'Answer',
      promptTemplate: '',
      mute: false
    } as IWFNAnswer
  }
}

function createSkillNodes(agentNode: TXpertTeamNode<'agent'>, skills: string[]): TXpertTeamNode<'workflow'>[] {
  return skills.map((skill, index, items) => {
    const key = genXpertSkillKey()
    return {
      type: 'workflow',
      key,
      position: {
        x: agentNode.position.x + HORIZONTAL_OFFSET,
        y: getCenteredY(agentNode.position.y, items.length, index)
      },
      entity: {
        type: WorkflowNodeTypeEnum.SKILL,
        key,
        title: skill,
        skills: [skill]
      } as IWFNSkill
    }
  })
}

function createMiddlewareNodes(
  agentNode: TXpertTeamNode<'agent'>,
  middlewares: string[]
): TXpertTeamNode<'workflow'>[] {
  return middlewares.map((provider, index) => {
    const key = genXpertMiddlewareKey()
    return {
      type: 'workflow',
      key,
      position: {
        x: agentNode.position.x,
        y: agentNode.position.y + MIDDLEWARE_VERTICAL_OFFSET + index * NODE_VERTICAL_GAP
      },
      entity: {
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        key,
        title: provider,
        provider
      } as IWFNMiddleware
    }
  })
}

function createConnection(type: TXpertTeamConnection['type'], from: string, to: string): TXpertTeamConnection {
  return {
    type,
    key: `${from}/${to}`,
    from,
    to
  }
}

function getCenteredY(anchorY: number, total: number, index: number) {
  return anchorY - ((total - 1) * NODE_VERTICAL_GAP) / 2 + index * NODE_VERTICAL_GAP
}

function uniqueStrings(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => value?.trim()).filter((value): value is string => !!value)))
}
