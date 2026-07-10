import { cloneDeep } from 'lodash-es'
import {
  IWFNChunker,
  IWFNMiddleware,
  IWFNProcessor,
  IWFNSource,
  IWFNTrigger,
  IWFNUnderstanding,
  IXpert,
  IXpertTool,
  IXpertToolset,
  TXpertTeamConnection,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import {
  BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
  BlankRepositoryDefaultSelection,
  BlankTriggerSelection,
  BlankXpertDraftBuildOptions,
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

type BlankAgentTemplateApplyOptions = Pick<
  BlankXpertDraftBuildOptions,
  'defaultCopilotModel' | 'defaultSandboxProvider' | 'middlewareDefinitions'
>

export type BlankTemplateToolsetResolution = {
  templateNodeKey: string
  targetAgentKey?: string | null
  toolset: IXpertToolset
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
    copilotModel: cloneMaybe(
      draft.team?.copilotModel ??
        getPrimaryAgentNodeMaybe(draft)?.entity?.copilotModel ??
        draft.team?.agent?.copilotModel
    )
  }
}

export function extractAgentTemplateWizardState(draft: TXpertTeamDraft): BlankAgentTemplateWizardState {
  const primaryAgentNode = getPrimaryAgentNode(draft)
  const inboundNodeKeys = getInboundNodeKeys(draft, primaryAgentNode.key)

  const triggerNodes = sortNodesByPosition(
    getWorkflowNodesByKeys(draft, inboundNodeKeys).filter(
      (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNTrigger } =>
        node.entity.type === WorkflowNodeTypeEnum.TRIGGER
    )
  )
  const middlewareNodes = getPrimaryAgentMiddlewareNodes(draft, primaryAgentNode.key)

  return {
    basic: extractTemplateBasicInfo(draft),
    selections: normalizeBlankWizardSelections({
      triggers: triggerNodes.map((node) => toTriggerSelection(node.entity)),
      skills: extractExplicitSkillsFromMiddlewares(middlewareNodes),
      repositoryDefault: extractRepositoryDefaultFromMiddlewares(middlewareNodes),
      middlewares: middlewareNodes.map((node) => node.entity.provider).filter(Boolean),
      middlewareRequired: extractMiddlewareRequiredSelections(middlewareNodes)
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
  selections?: XpertBlankWizardSelections,
  options?: BlankAgentTemplateApplyOptions
): TXpertTeamDraft {
  const nextDraft = cloneDeep(draft)
  const primaryAgentNode = getPrimaryAgentNode(nextDraft)
  const primaryAgentMiddlewareNodes = getPrimaryAgentMiddlewareNodes(nextDraft, primaryAgentNode.key)
  const managedNodeKeys = new Set(
    [
      ...getInboundNodeKeys(nextDraft, primaryAgentNode.key),
      ...getOutboundNodeKeys(nextDraft, primaryAgentNode.key),
      ...primaryAgentMiddlewareNodes.map((node) => node.key)
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
  } = buildBlankXpertSelectionGraph(primaryAgentNode, selections, options)

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

export function applyTemplateToolsetResolutionsToDraft(
  draft: TXpertTeamDraft,
  resolutions: BlankTemplateToolsetResolution[]
): TXpertTeamDraft {
  const nextDraft = cloneDeep(draft)

  for (const resolution of resolutions) {
    applyTemplateToolsetResolution(nextDraft, resolution)
  }

  return nextDraft
}

function applyTemplateToolsetResolution(draft: TXpertTeamDraft, resolution: BlankTemplateToolsetResolution) {
  const templateNodeKey = normalizeString(resolution.templateNodeKey)
  const toolsetId = normalizeString(resolution.toolset.id)
  if (!templateNodeKey || !toolsetId) {
    throw new Error('Template toolset dependency requires templateNodeKey and resolved toolset id.')
  }

  const targetAgentKey = resolveTemplateToolsetTargetAgentKey(draft, templateNodeKey, resolution.targetAgentKey)
  const placeholderNode = draft.nodes.find((node) => node.type === 'toolset' && node.key === templateNodeKey)
  const runtimeNode = draft.nodes.find((node) => node.type === 'toolset' && node.key === toolsetId)
  const position = cloneMaybe(placeholderNode?.position ?? runtimeNode?.position ?? { x: 280, y: 260 })
  const size = cloneMaybe(placeholderNode?.size ?? runtimeNode?.size)
  const nextNode: TXpertTeamNode<'toolset'> = {
    key: toolsetId,
    type: 'toolset',
    position,
    ...(size ? { size } : {}),
    entity: sanitizeToolsetForTemplateDraft(resolution.toolset)
  }
  const insertIndex = Math.max(
    0,
    draft.nodes.findIndex((node) => node.key === templateNodeKey || node.key === toolsetId)
  )

  draft.nodes = draft.nodes.filter(
    (node) => !(node.type === 'toolset' && (node.key === templateNodeKey || node.key === toolsetId))
  )
  draft.nodes.splice(insertIndex, 0, nextNode)
  draft.connections = rewriteTemplateToolsetConnections(draft.connections ?? [], templateNodeKey, toolsetId)
  ensureConnection(draft.connections, 'toolset', targetAgentKey, toolsetId)
  rewriteTemplateToolsetAgentRefs(draft, templateNodeKey, toolsetId, targetAgentKey)
  rewriteTemplateToolsetTeamRefs(draft, templateNodeKey, resolution.toolset, position)
}

function resolveTemplateToolsetTargetAgentKey(
  draft: TXpertTeamDraft,
  templateNodeKey: string,
  requestedAgentKey?: string | null
) {
  const requested = normalizeString(requestedAgentKey)
  if (requested) {
    if (!templateDraftHasAgent(draft, requested)) {
      throw new Error(`Template toolset target agent '${requested}' was not found.`)
    }
    return requested
  }

  const connectedAgentKey = draft.connections?.find(
    (connection) => connection.type === 'toolset' && connection.to === templateNodeKey
  )?.from
  if (connectedAgentKey) {
    return connectedAgentKey
  }

  const agentWithToolset = draft.nodes.find(
    (node) =>
      node.type === 'agent' &&
      Array.isArray(node.entity?.toolsetIds) &&
      node.entity.toolsetIds.includes(templateNodeKey)
  )
  if (agentWithToolset?.type === 'agent') {
    return agentWithToolset.key
  }

  const primaryAgentKey = normalizeString(draft.team?.agent?.key)
  if (primaryAgentKey) {
    return primaryAgentKey
  }

  const firstAgent = draft.nodes.find((node) => node.type === 'agent')
  if (firstAgent?.type === 'agent') {
    return firstAgent.key
  }

  throw new Error('Template toolset dependency requires a target agent.')
}

function templateDraftHasAgent(draft: TXpertTeamDraft, agentKey: string) {
  return (
    draft.team?.agent?.key === agentKey || draft.nodes.some((node) => node.type === 'agent' && node.key === agentKey)
  )
}

function rewriteTemplateToolsetConnections(
  connections: TXpertTeamConnection[],
  templateNodeKey: string,
  toolsetId: string
) {
  const rewritten = connections.map((connection) => {
    const from = connection.from === templateNodeKey ? toolsetId : connection.from
    const to = connection.to === templateNodeKey ? toolsetId : connection.to
    return {
      ...connection,
      from,
      to,
      key: `${from}/${to}`
    }
  })

  return uniqueConnections(rewritten)
}

function rewriteTemplateToolsetAgentRefs(
  draft: TXpertTeamDraft,
  templateNodeKey: string,
  toolsetId: string,
  targetAgentKey: string
) {
  draft.nodes = draft.nodes.map((node) => {
    if (node.type !== 'agent') {
      return node
    }

    return {
      ...node,
      entity: rewriteAgentToolsetIds(node.entity, templateNodeKey, toolsetId, node.key === targetAgentKey)
    }
  })

  if (draft.team?.agent) {
    draft.team = {
      ...draft.team,
      agent: rewriteAgentToolsetIds(
        draft.team.agent,
        templateNodeKey,
        toolsetId,
        draft.team.agent.key === targetAgentKey
      )
    }
  }
}

function rewriteAgentToolsetIds<T extends { toolsetIds?: string[] }>(
  agent: T,
  templateNodeKey: string,
  toolsetId: string,
  shouldAttach: boolean
): T {
  const nextIds = uniqueStrings((agent.toolsetIds ?? []).filter((id) => id !== templateNodeKey && id !== toolsetId))
  if (shouldAttach) {
    nextIds.push(toolsetId)
  }

  return {
    ...agent,
    toolsetIds: uniqueStrings(nextIds)
  }
}

function rewriteTemplateToolsetTeamRefs(
  draft: TXpertTeamDraft,
  templateNodeKey: string,
  toolset: IXpertToolset,
  position: TXpertTeamNode['position']
) {
  const toolsetId = toolset.id
  const sanitizedToolset = sanitizeToolsetForTemplateDraft(toolset)
  const existingOptions = isObjectRecord(draft.team?.options?.toolset) ? draft.team.options.toolset : null
  const migratedToolsetOptions = existingOptions
    ? {
        ...existingOptions,
        [toolsetId]: cloneMaybe(existingOptions[toolsetId] ?? existingOptions[templateNodeKey] ?? { position })
      }
    : {
        [toolsetId]: { position: cloneMaybe(position) }
      }
  delete migratedToolsetOptions[templateNodeKey]

  draft.team = {
    ...draft.team,
    toolsets: [
      ...(draft.team?.toolsets ?? []).filter((item) => item.id !== templateNodeKey && item.id !== toolsetId),
      sanitizedToolset
    ],
    options: {
      ...(draft.team?.options ?? {}),
      toolset: migratedToolsetOptions
    }
  }
}

function sanitizeToolsetForTemplateDraft(toolset: IXpertToolset): IXpertToolset {
  const sanitized: IXpertToolset = {
    id: toolset.id,
    name: toolset.name,
    type: toolset.type,
    category: toolset.category ?? XpertToolsetCategoryEnum.BUILTIN,
    description: toolset.description,
    avatar: cloneMaybe(toolset.avatar),
    options: cloneMaybe(toolset.options),
    privacyPolicy: toolset.privacyPolicy,
    customDisclaimer: toolset.customDisclaimer,
    tags: cloneMaybe(toolset.tags),
    tools: cloneMaybe(toolset.tools)?.map(sanitizeToolForTemplateDraft)
  }

  delete sanitized.credentials
  return sanitized
}

function sanitizeToolForTemplateDraft(tool: IXpertTool): IXpertTool {
  const nextTool = cloneMaybe(tool)
  delete nextTool.toolset
  delete nextTool.toolsetId
  return nextTool
}

function getPrimaryAgentNode(draft: TXpertTeamDraft): TXpertTeamNode<'agent'> {
  const primaryAgentNode = getPrimaryAgentNodeMaybe(draft)

  if (!primaryAgentNode) {
    throw new Error('Primary agent node not found in template draft')
  }

  return primaryAgentNode
}

function getPrimaryAgentNodeMaybe(draft: TXpertTeamDraft): TXpertTeamNode<'agent'> | null {
  const primaryAgentKey = draft.team?.agent?.key
  if (!primaryAgentKey) {
    return null
  }

  return (
    draft.nodes.find(
      (node): node is TXpertTeamNode<'agent'> => node.type === 'agent' && node.key === primaryAgentKey
    ) ?? null
  )
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

/**
 * Assistant templates in the wild use three middleware association formats:
 * the current Agent -> Middleware workflow edge, legacy/reversed edges, and the
 * primary agent's middleware order. Treat all three as authoritative so the
 * creation wizard can faithfully initialize middleware selections.
 */
function getPrimaryAgentMiddlewareNodes(draft: TXpertTeamDraft, primaryAgentKey: string) {
  const middlewareNodes = draft.nodes.filter(
    (node): node is TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } =>
      node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
  )
  const middlewareNodeKeys = new Set(middlewareNodes.map((node) => node.key))
  const middlewareOrder = uniqueStrings(draft.team?.agent?.options?.middlewares?.order)
  const associatedNodeKeys = new Set(middlewareOrder.filter((key) => middlewareNodeKeys.has(key)))

  for (const connection of draft.connections ?? []) {
    const from = normalizeConnectionEndpoint(connection.from)
    const to = normalizeConnectionEndpoint(connection.to)
    if (from === primaryAgentKey && middlewareNodeKeys.has(to)) {
      associatedNodeKeys.add(to)
    }
    if (to === primaryAgentKey && middlewareNodeKeys.has(from)) {
      associatedNodeKeys.add(from)
    }
  }

  return sortMiddlewareNodes(
    middlewareNodes.filter((node) => associatedNodeKeys.has(node.key)),
    middlewareOrder
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

function extractExplicitSkillsFromMiddlewares(nodes: Array<TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware }>) {
  return uniqueStrings(
    nodes.flatMap((node) =>
      node.entity.provider === BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER
        ? readSkillsMiddlewareSelection(node.entity.options)
        : []
    )
  )
}

function extractRepositoryDefaultFromMiddlewares(
  nodes: Array<TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware }>
) {
  for (const node of nodes) {
    if (node.entity.provider !== BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER) {
      continue
    }

    const selection = readSkillsMiddlewareRepositoryDefault(node.entity.options)
    if (selection) {
      return selection
    }
  }

  return null
}

function extractMiddlewareRequiredSelections(
  nodes: Array<TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware }>
): Record<string, boolean> {
  return nodes.reduce<Record<string, boolean>>((result, node) => {
    if (node.entity.provider && node.entity.required === false) {
      result[node.entity.provider] = false
    }
    return result
  }, {})
}

function readSkillsMiddlewareSelection(options: unknown) {
  const skills = (options as { skills?: unknown } | null)?.skills
  return Array.isArray(skills)
    ? uniqueStrings(skills.filter((skill): skill is string => typeof skill === 'string'))
    : []
}

function readSkillsMiddlewareRepositoryDefault(options: unknown): BlankRepositoryDefaultSelection | null {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return null
  }

  const candidate = 'repositoryDefault' in options ? options.repositoryDefault : null
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null
  }

  const repositoryId =
    'repositoryId' in candidate && typeof candidate.repositoryId === 'string' ? candidate.repositoryId.trim() : ''
  if (!repositoryId) {
    return null
  }

  const disabledSkillIds =
    'disabledSkillIds' in candidate && Array.isArray(candidate.disabledSkillIds)
      ? uniqueStrings(candidate.disabledSkillIds.filter((skill): skill is string => typeof skill === 'string'))
      : []

  return {
    repositoryId,
    disabledSkillIds
  }
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

function ensureConnection(
  connections: TXpertTeamConnection[],
  type: TXpertTeamConnection['type'],
  from: string,
  to: string
) {
  if (!connections.some((connection) => connection.type === type && connection.from === from && connection.to === to)) {
    connections.push(createConnection(type, from, to))
  }
}

function uniqueConnections(connections: TXpertTeamConnection[]) {
  const seen = new Set<string>()
  return connections.filter((connection) => {
    const key = `${connection.type}:${connection.from}:${connection.to}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
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

function isObjectRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function uniqueStrings(values?: Array<string | null | undefined>) {
  return Array.from(new Set((values ?? []).map((value) => value?.trim()).filter((value): value is string => !!value)))
}
