import {
  AiModelTypeEnum,
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
  IWFNSource,
  IWFNTemplate,
  IWFNTrigger,
  IWFNUnderstanding,
  ICopilotModel,
  IXpert,
  JsonSchemaObjectType,
  TXpertTeamConnection,
  TXpertTeamDraft,
  TXpertTeamNode,
  letterStartSUID,
  VariableOperationEnum,
  WorkflowNodeTypeEnum,
  XpertParameterTypeEnum
} from '@xpert-ai/contracts'
import { layoutGraphWithMixedDirection } from '../../studio/domain/layout/layout'

const HORIZONTAL_OFFSET = 280
const MIDDLEWARE_VERTICAL_OFFSET = 220
const NODE_VERTICAL_GAP = 120
const KNOWLEDGE_STAGE_X_GAP = 320
const KNOWLEDGE_STAGE_BASE_Y = 220
const WORKFLOW_STAGE_X_GAP = 320
const WORKFLOW_STAGE_BASE_Y = 0

export const BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER = 'skillsMiddleware'

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

export type BlankTriggerSelection = {
  provider: string
  config?: Record<string, unknown> | null
}

export type XpertBlankWizardSelections = {
  triggers?: BlankTriggerSelection[]
  triggerProviders?: string[]
  skills?: string[]
  middlewares?: string[]
}

export type KnowledgeBlankWizardSelections = {
  triggers?: BlankTriggerSelection[]
  triggerProviders?: string[]
  sourceProviders?: string[]
  processorProviders?: string[]
  chunkerProviders?: string[]
  understandingProviders?: string[]
}

export type WorkflowBlankWizardSelections = {
  nodes?: BlankWorkflowStarterNodeKey[]
}

export type BlankXpertSelectionGraph = {
  triggerNodes: TXpertTeamNode<'workflow'>[]
  middlewareNodes: TXpertTeamNode<'workflow'>[]
  nodes: TXpertTeamNode<'workflow'>[]
  connections: TXpertTeamConnection[]
}

export type BlankKnowledgeSelectionGraph = {
  stageGroups: TXpertTeamNode<'workflow'>[][]
  nodes: TXpertTeamNode<'workflow'>[]
  connections: TXpertTeamConnection[]
}

export type BlankMiddlewareDefinition = {
  name: string
  configSchema?: JsonSchemaObjectType
}

export type BlankXpertDraftBuildOptions = {
  defaultCopilotModel?: ICopilotModel | null
  middlewareDefinitions?: BlankMiddlewareDefinition[]
}

export function normalizeBlankWizardSelections(
  selections?: XpertBlankWizardSelections
): Required<XpertBlankWizardSelections> {
  const skills = uniqueStrings(selections?.skills)
  return {
    triggers: normalizeBlankTriggerSelections(selections?.triggers, selections?.triggerProviders),
    triggerProviders: uniqueStrings(selections?.triggerProviders),
    skills,
    middlewares: normalizeBlankMiddlewareSelections(selections?.middlewares, skills)
  }
}

export function hasBlankWizardSelections(selections?: XpertBlankWizardSelections): boolean {
  const normalized = normalizeBlankWizardSelections(selections)
  return !!(normalized.triggers.length || normalized.skills.length || normalized.middlewares.length)
}

export function normalizeKnowledgeBlankWizardSelections(
  selections?: KnowledgeBlankWizardSelections
): Required<KnowledgeBlankWizardSelections> {
  return {
    triggers: normalizeBlankTriggerSelections(selections?.triggers, selections?.triggerProviders),
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
  selections?: XpertBlankWizardSelections,
  options?: BlankXpertDraftBuildOptions
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

  const {
    triggerNodes,
    middlewareNodes,
    nodes: selectionNodes,
    connections: selectionConnections
  } = buildBlankXpertSelectionGraph(primaryAgentNode, normalized, {
    defaultCopilotModel: options?.defaultCopilotModel ?? xpert.agent?.copilotModel ?? xpert.copilotModel ?? null,
    middlewareDefinitions: options?.middlewareDefinitions
  })

  nodes.push(...selectionNodes)
  connections.push(...selectionConnections)

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
  const { agents, ...team } = xpert
  const { nodes, connections } = buildBlankKnowledgeSelectionGraph(selections)

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

export function buildBlankXpertSelectionGraph(
  agentNode: TXpertTeamNode<'agent'>,
  selections?: XpertBlankWizardSelections,
  options?: BlankXpertDraftBuildOptions
): BlankXpertSelectionGraph {
  const normalized = normalizeBlankWizardSelections(selections)
  const triggerNodes = createTriggerNodes(agentNode, normalized.triggers)
  const middlewareNodes = createMiddlewareNodes(
    agentNode,
    normalized.middlewares,
    normalized.skills,
    options?.middlewareDefinitions ?? [],
    options?.defaultCopilotModel ?? null
  )
  const nodes = [...triggerNodes, ...middlewareNodes]
  const connections = [
    ...triggerNodes.map((node) => createConnection('edge', node.key, agentNode.key)),
    ...middlewareNodes.map((node) => createConnection('workflow', agentNode.key, node.key))
  ]

  return {
    triggerNodes,
    middlewareNodes,
    nodes,
    connections
  }
}

export function buildBlankKnowledgeSelectionGraph(
  selections?: KnowledgeBlankWizardSelections,
  options?: { includeKnowledgeBase?: boolean }
): BlankKnowledgeSelectionGraph {
  const normalized = normalizeKnowledgeBlankWizardSelections(selections)
  const stageGroups = createKnowledgePipelineStageGroups(normalized, options)
  const nodes = stageGroups.flat()
  const connections = createKnowledgePipelineConnections(stageGroups)

  return {
    stageGroups,
    nodes,
    connections
  }
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
  triggers: BlankTriggerSelection[]
): TXpertTeamNode<'workflow'>[] {
  return triggers.map((trigger, index, providers) => {
    const provider = trigger.provider
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
        title: provider === 'chat' ? 'Trigger' : provider,
        config: provider === 'chat' ? undefined : (trigger.config ?? {})
      } as IWFNTrigger
    }
  })
}

function createKnowledgePipelineStageGroups(
  selections: Required<KnowledgeBlankWizardSelections>,
  options?: { includeKnowledgeBase?: boolean }
): TXpertTeamNode<'workflow'>[][] {
  const includeKnowledgeBase = options?.includeKnowledgeBase ?? true
  const stageGroups: TXpertTeamNode<'workflow'>[][] = [
    selections.triggers.map((trigger) => createKnowledgeTriggerNode(trigger)),
    selections.sourceProviders.map((provider) => createKnowledgeSourceNode(provider)),
    selections.processorProviders.map((provider) => createKnowledgeProcessorNode(provider)),
    selections.chunkerProviders.map((provider) => createKnowledgeChunkerNode(provider)),
    selections.understandingProviders.map((provider) => createKnowledgeUnderstandingNode(provider)),
    ...(includeKnowledgeBase ? [[createKnowledgeBaseNode()]] : [])
  ].filter((group) => group.length)

  positionKnowledgePipelineStageGroups(stageGroups)

  return stageGroups
}

function createKnowledgeTriggerNode(trigger: BlankTriggerSelection): TXpertTeamNode<'workflow'> {
  const provider = trigger.provider
  const key = genXpertTriggerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.TRIGGER,
      key,
      from: provider,
      title: provider === 'chat' ? 'Chat' : provider,
      config: provider === 'chat' ? undefined : (trigger.config ?? {})
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

function createMiddlewareNodes(
  agentNode: TXpertTeamNode<'agent'>,
  middlewares: string[],
  skills: string[],
  middlewareDefinitions: BlankMiddlewareDefinition[],
  defaultCopilotModel: ICopilotModel | null
): TXpertTeamNode<'workflow'>[] {
  const definitions = new Map(middlewareDefinitions.map((definition) => [definition.name, definition]))

  return middlewares.map((provider, index) => {
    const key = genXpertMiddlewareKey()
    const middlewareOptions = mergeOptionObjects(
      createDefaultMiddlewareOptions(definitions.get(provider)?.configSchema, defaultCopilotModel),
      provider === BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER && skills.length ? { skills: [...skills] } : undefined
    )

    return {
      type: 'workflow',
      key,
      position: {
        x: agentNode.position.x,
        y: agentNode.position.y + MIDDLEWARE_VERTICAL_OFFSET + index * NODE_VERTICAL_GAP
      },
      entity: {
        id: key,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        key,
        title: provider,
        provider,
        ...(middlewareOptions ? { options: middlewareOptions } : {})
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

export function normalizeBlankTriggerSelections(
  selections?: BlankTriggerSelection[] | null,
  triggerProviders?: string[] | null
): BlankTriggerSelection[] {
  const normalizedSelections: BlankTriggerSelection[] = [
    ...(selections ?? []),
    ...uniqueStrings(triggerProviders).map((provider): BlankTriggerSelection => ({ provider }))
  ]
  const deduped = new Map<string, BlankTriggerSelection>()

  for (const selection of normalizedSelections) {
    const provider = selection?.provider?.trim()
    if (!provider) {
      continue
    }

    const config =
      selection.config && typeof selection.config === 'object' && !Array.isArray(selection.config)
        ? { ...(selection.config as Record<string, unknown>) }
        : selection.config === null
          ? null
          : undefined

    deduped.set(provider, config === undefined ? { provider } : { provider, config })
  }

  return Array.from(deduped.values())
}

export function normalizeBlankMiddlewareSelections(middlewares?: string[] | null, skills?: string[] | null): string[] {
  const normalized = uniqueStrings(middlewares)
  const hasSkillsMiddleware = normalized.includes(BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER)
  const visibleMiddlewares = normalized.filter((provider) => provider !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER)

  return uniqueStrings(
    skills?.length
      ? hasSkillsMiddleware
        ? normalized
        : [...visibleMiddlewares, BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER]
      : visibleMiddlewares
  )
}

function uniqueStrings(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => value?.trim()).filter((value): value is string => !!value)))
}

function createDefaultMiddlewareOptions(
  configSchema: JsonSchemaObjectType | undefined,
  defaultCopilotModel: ICopilotModel | null
): Record<string, unknown> | undefined {
  if (!isValidDefaultLlmModel(defaultCopilotModel) || !configSchema?.properties) {
    return undefined
  }

  const modelPaths = collectDefaultModelPaths(configSchema)
  if (!modelPaths.length) {
    return undefined
  }

  const options: Record<string, unknown> = {}
  for (const path of modelPaths) {
    setNestedValue(options, path, structuredClone(defaultCopilotModel))
  }

  return Object.keys(options).length ? options : undefined
}

function collectDefaultModelPaths(schema: JsonSchemaObjectType, path: string[] = []): string[][] {
  return Object.entries(schema.properties ?? {}).flatMap(([key, property]) => {
    if (!isPlainObject(property)) {
      return []
    }

    const nextPath = [...path, key]
    if (isLlmModelSelectField(property)) {
      return [nextPath]
    }

    if (isJsonSchemaObject(property)) {
      return collectDefaultModelPaths(property, nextPath)
    }

    return []
  })
}

function isLlmModelSelectField(value: Record<string, unknown>) {
  const ui = isPlainObject(value['x-ui']) ? value['x-ui'] : null
  if (!ui || ui['component'] !== 'ai-model-select') {
    return false
  }

  const inputs = isPlainObject(ui['inputs']) ? ui['inputs'] : null
  if (!inputs) {
    return true
  }

  const modelType = inputs['modelType']
  return typeof modelType !== 'string' || modelType === AiModelTypeEnum.LLM
}

function isValidDefaultLlmModel(value: ICopilotModel | null | undefined): value is ICopilotModel {
  return (
    !!value?.copilotId?.trim() &&
    !!value?.model?.trim() &&
    (value.modelType ?? AiModelTypeEnum.LLM) === AiModelTypeEnum.LLM
  )
}

function mergeOptionObjects(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!base) {
    return override ? { ...override } : undefined
  }

  if (!override) {
    return { ...base }
  }

  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const current = result[key]
    result[key] =
      isPlainObject(current) && isPlainObject(value)
        ? (mergeOptionObjects(current, value) ?? {})
        : Array.isArray(value)
          ? [...value]
          : value
  }

  return result
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown) {
  let current = target

  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      current[segment] = value
      return
    }

    const next = isPlainObject(current[segment]) ? current[segment] : {}
    current[segment] = next
    current = next
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJsonSchemaObject(value: Record<string, unknown>): value is JsonSchemaObjectType {
  return value['type'] === 'object' && isPlainObject(value['properties'])
}
