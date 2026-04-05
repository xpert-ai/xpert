import { cloneDeep } from 'lodash-es'
import {
  IWFNChunker,
  IWFNMiddleware,
  IWFNProcessor,
  IWFNSource,
  IWFNTrigger,
  IWFNUnderstanding,
  IXpert,
  TXpertTeamConnection,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '@metad/contracts'
import {
  BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
  BlankTriggerSelection,
  buildBlankKnowledgeSelectionGraph,
  buildBlankXpertSelectionGraph,
  KnowledgeBlankWizardSelections,
  normalizeBlankWizardSelections,
  normalizeKnowledgeBlankWizardSelections,
  XpertBlankWizardSelections
} from './blank-draft.util'

export type BlankXpertStartMode = 'blank' | 'template'

export type BlankTemplateBasicInfo = Pick<Partial<IXpert>, 'name' | 'title' | 'description' | 'avatar' | 'copilotModel'>

export type BlankAgentTemplateWizardState = {
  basic: BlankTemplateBasicInfo
  selections: Required<XpertBlankWizardSelections>
}

export type BlankKnowledgeTemplateWizardState = {
  basic: BlankTemplateBasicInfo
  selections: Required<KnowledgeBlankWizardSelections>
}

const KNOWLEDGE_MANAGED_NODE_TYPES = new Set<WorkflowNodeTypeEnum>([
  WorkflowNodeTypeEnum.TRIGGER,
  WorkflowNodeTypeEnum.SOURCE,
  WorkflowNodeTypeEnum.PROCESSOR,
  WorkflowNodeTypeEnum.CHUNKER,
  WorkflowNodeTypeEnum.UNDERSTANDING
])

export function extractTemplateBasicInfo(draft: TXpertTeamDraft): BlankTemplateBasicInfo {
  return {
    name: draft.team?.name ?? undefined,
    title: draft.team?.title ?? undefined,
    description: draft.team?.description ?? undefined,
    avatar: cloneMaybe(draft.team?.avatar),
    copilotModel: cloneMaybe(draft.team?.copilotModel)
  }
}

export function extractAgentTemplateWizardState(draft: TXpertTeamDraft): BlankAgentTemplateWizardState {
  const primaryAgentNode = getPrimaryAgentNode(draft)
  const inboundNodeKeys = getInboundNodeKeys(draft, primaryAgentNode.key)
  const outboundNodeKeys = getOutboundNodeKeys(draft, primaryAgentNode.key)

  const triggerNodes = sortNodesByPosition(
    getWorkflowNodesByKeys(draft, inboundNodeKeys).filter(
      (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNTrigger } =>
        node.entity.type === WorkflowNodeTypeEnum.TRIGGER
    )
  )
  const middlewareNodes = sortMiddlewareNodes(
    getWorkflowNodesByKeys(draft, outboundNodeKeys).filter(
      (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } =>
        node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
    ),
    draft.team?.agent?.options?.middlewares?.order ?? []
  )

  return {
    basic: extractTemplateBasicInfo(draft),
    selections: normalizeBlankWizardSelections({
      triggers: triggerNodes.map((node) => toTriggerSelection(node.entity)),
      skills: extractSkillsFromMiddlewares(middlewareNodes),
      middlewares: middlewareNodes.map((node) => node.entity.provider).filter(Boolean)
    })
  }
}

export function extractKnowledgeTemplateWizardState(draft: TXpertTeamDraft): BlankKnowledgeTemplateWizardState {
  const workflowNodes = draft.nodes.filter(isWorkflowNode)

  return {
    basic: extractTemplateBasicInfo(draft),
    selections: normalizeKnowledgeBlankWizardSelections({
      triggers: sortNodesByPosition(
        workflowNodes.filter(
          (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNTrigger } =>
            node.entity.type === WorkflowNodeTypeEnum.TRIGGER
        )
      ).map((node) => toTriggerSelection(node.entity)),
      sourceProviders: sortNodesByPosition(
        workflowNodes.filter(
          (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNSource } =>
            node.entity.type === WorkflowNodeTypeEnum.SOURCE
        )
      ).map((node) => node.entity.provider),
      processorProviders: sortNodesByPosition(
        workflowNodes.filter(
          (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNProcessor } =>
            node.entity.type === WorkflowNodeTypeEnum.PROCESSOR
        )
      ).map((node) => node.entity.provider),
      chunkerProviders: sortNodesByPosition(
        workflowNodes.filter(
          (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNChunker } =>
            node.entity.type === WorkflowNodeTypeEnum.CHUNKER
        )
      ).map((node) => node.entity.provider),
      understandingProviders: sortNodesByPosition(
        workflowNodes.filter(
          (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNUnderstanding } =>
            node.entity.type === WorkflowNodeTypeEnum.UNDERSTANDING
        )
      ).map((node) => node.entity.provider)
    })
  }
}

export function applyAgentTemplateWizardState(
  draft: TXpertTeamDraft,
  selections?: XpertBlankWizardSelections
): TXpertTeamDraft {
  const nextDraft = cloneDeep(draft)
  const primaryAgentNode = getPrimaryAgentNode(nextDraft)
  const managedNodeKeys = new Set(
    [
      ...getInboundNodeKeys(nextDraft, primaryAgentNode.key),
      ...getOutboundNodeKeys(nextDraft, primaryAgentNode.key)
    ].filter((key) => {
      const node = nextDraft.nodes.find((item) => item.key === key)
      return (
        node?.type === 'workflow' &&
        [WorkflowNodeTypeEnum.TRIGGER, WorkflowNodeTypeEnum.SKILL, WorkflowNodeTypeEnum.MIDDLEWARE].includes(
          node.entity.type
        )
      )
    })
  )

  const {
    nodes: managedNodes,
    connections: managedConnections,
    middlewareNodes
  } = buildBlankXpertSelectionGraph(primaryAgentNode, selections)

  nextDraft.nodes = [...nextDraft.nodes.filter((node) => !managedNodeKeys.has(node.key)), ...managedNodes]
  nextDraft.connections = [
    ...nextDraft.connections.filter((connection) => !connectionTouchesKeys(connection, managedNodeKeys)),
    ...managedConnections
  ]
  nextDraft.team = {
    ...nextDraft.team,
    agent: updateAgentMiddlewareOrder(
      nextDraft.team?.agent,
      middlewareNodes.map((node) => node.key)
    )
  }

  return nextDraft
}

export function applyKnowledgeTemplateWizardState(
  draft: TXpertTeamDraft,
  selections?: KnowledgeBlankWizardSelections
): TXpertTeamDraft {
  const nextDraft = cloneDeep(draft)
  const managedNodeKeys = new Set(
    nextDraft.nodes
      .filter(
        (node): node is TXpertTeamNode<'workflow'> =>
          node.type === 'workflow' && KNOWLEDGE_MANAGED_NODE_TYPES.has(node.entity.type)
      )
      .map((node) => node.key)
  )

  const { stageGroups, nodes, connections } = buildBlankKnowledgeSelectionGraph(selections, {
    includeKnowledgeBase: false
  })
  const lastStageNodes = stageGroups[stageGroups.length - 1] ?? []
  const knowledgeBaseNodes = nextDraft.nodes.filter(
    (node): node is TXpertTeamNode<'workflow'> =>
      node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.KNOWLEDGE_BASE
  )

  nextDraft.nodes = [...nextDraft.nodes.filter((node) => !managedNodeKeys.has(node.key)), ...nodes]
  nextDraft.connections = [
    ...nextDraft.connections.filter((connection) => !connectionTouchesKeys(connection, managedNodeKeys)),
    ...connections,
    ...connectLastStageToKnowledgeBases(lastStageNodes, knowledgeBaseNodes)
  ]

  return nextDraft
}

function getPrimaryAgentNode(draft: TXpertTeamDraft): TXpertTeamNode<'agent'> {
  const primaryAgentKey = draft.team?.agent?.key
  const primaryAgentNode = draft.nodes.find(
    (node): node is TXpertTeamNode<'agent'> => node.type === 'agent' && node.key === primaryAgentKey
  )

  if (!primaryAgentKey || !primaryAgentNode) {
    throw new Error('Primary agent node not found in template draft')
  }

  return primaryAgentNode
}

function getInboundNodeKeys(draft: TXpertTeamDraft, targetKey: string): string[] {
  return uniqueStrings(
    draft.connections
      .filter((connection) => normalizeConnectionEndpoint(connection.to) === targetKey)
      .map((connection) => normalizeConnectionEndpoint(connection.from))
  )
}

function getOutboundNodeKeys(draft: TXpertTeamDraft, sourceKey: string): string[] {
  return uniqueStrings(
    draft.connections
      .filter(
        (connection) => connection.type === 'workflow' && normalizeConnectionEndpoint(connection.from) === sourceKey
      )
      .map((connection) => normalizeConnectionEndpoint(connection.to))
  )
}

function getWorkflowNodesByKeys(draft: TXpertTeamDraft, keys: string[]) {
  const keySet = new Set(keys)
  return draft.nodes.filter(
    (node): node is TXpertTeamNode<'workflow'> => node.type === 'workflow' && keySet.has(node.key)
  )
}

function sortMiddlewareNodes(nodes: Array<TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware }>, order: string[]) {
  const orderMap = new Map(order.map((key, index) => [key, index]))
  return [...nodes].sort((left, right) => {
    const leftIndex = orderMap.get(left.key)
    const rightIndex = orderMap.get(right.key)
    if (leftIndex != null || rightIndex != null) {
      return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER)
    }

    return compareNodePosition(left, right)
  })
}

function sortNodesByPosition<T extends TXpertTeamNode>(nodes: T[]): T[] {
  return [...nodes].sort(compareNodePosition)
}

function compareNodePosition(left: TXpertTeamNode, right: TXpertTeamNode) {
  if (left.position.x !== right.position.x) {
    return left.position.x - right.position.x
  }

  if (left.position.y !== right.position.y) {
    return left.position.y - right.position.y
  }

  return left.key.localeCompare(right.key)
}

function toTriggerSelection(trigger: IWFNTrigger): BlankTriggerSelection {
  const provider = `${trigger.from ?? ''}`.trim()
  if (!provider || provider === 'chat') {
    return { provider: 'chat' }
  }

  const config = cloneConfig(trigger.config)
  return config === undefined ? { provider } : { provider, config }
}

function extractSkillsFromMiddlewares(nodes: Array<TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware }>) {
  return uniqueStrings(
    nodes.flatMap((node) =>
      node.entity.provider === BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER
        ? readSkillsMiddlewareSelection(node.entity.options)
        : []
    )
  )
}

function readSkillsMiddlewareSelection(options: unknown) {
  const skills = (options as { skills?: unknown } | null)?.skills
  return Array.isArray(skills)
    ? uniqueStrings(skills.filter((skill): skill is string => typeof skill === 'string'))
    : []
}

function updateAgentMiddlewareOrder(
  agent: TXpertTeamDraft['team']['agent'],
  middlewareOrder: string[]
): TXpertTeamDraft['team']['agent'] {
  const options = agent?.options ?? {}
  const { middlewares: _middlewares, ...restOptions } = options

  return {
    ...agent,
    options: middlewareOrder.length
      ? {
          ...restOptions,
          middlewares: {
            order: middlewareOrder
          }
        }
      : restOptions
  }
}

function connectLastStageToKnowledgeBases(
  lastStageNodes: TXpertTeamNode<'workflow'>[],
  knowledgeBaseNodes: TXpertTeamNode<'workflow'>[]
) {
  if (!lastStageNodes.length || !knowledgeBaseNodes.length) {
    return []
  }

  return lastStageNodes.flatMap((node) =>
    knowledgeBaseNodes.map((knowledgeBaseNode) => createConnection('edge', node.key, knowledgeBaseNode.key))
  )
}

function createConnection(type: TXpertTeamConnection['type'], from: string, to: string): TXpertTeamConnection {
  return {
    type,
    key: `${from}/${to}`,
    from,
    to
  }
}

function connectionTouchesKeys(connection: TXpertTeamConnection, keys: Set<string>) {
  return keys.has(normalizeConnectionEndpoint(connection.from)) || keys.has(normalizeConnectionEndpoint(connection.to))
}

function normalizeConnectionEndpoint(endpoint: string) {
  return endpoint?.split('/')?.[0] ?? endpoint
}

function isWorkflowNode(node: TXpertTeamNode): node is TXpertTeamNode<'workflow'> {
  return node.type === 'workflow'
}

function cloneMaybe<T>(value: T): T {
  return value == null ? value : cloneDeep(value)
}

function cloneConfig(config: unknown): Record<string, unknown> | null | undefined {
  if (config === null) {
    return null
  }

  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return cloneDeep(config as Record<string, unknown>)
  }

  return undefined
}

function uniqueStrings(values?: Array<string | null | undefined>) {
  return Array.from(new Set((values ?? []).map((value) => value?.trim()).filter((value): value is string => !!value)))
}
