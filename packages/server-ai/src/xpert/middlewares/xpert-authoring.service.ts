import {
  ChecklistItem,
  ISkillPackage,
  IXpert,
  TXpertTeamDraft,
  TXpertTeamNode,
  TXpertTeamConnection,
  WorkflowNodeTypeEnum,
  XpertTypeEnum,
  createAgentConnections,
  createXpertNodes,
  letterStartSUID,
  omitXpertRelations
} from '@metad/contracts'
import { yaml } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { createHash } from 'crypto'
import { KnowledgebaseService } from '../../knowledgebase/knowledgebase.service'
import { XpertAgentService } from '../../xpert-agent/xpert-agent.service'
import { ListWorkspaceSkillsQuery } from '../../xpert-agent/queries/list-workspace-skills.query'
import { XpertToolsetService } from '../../xpert-toolset/xpert-toolset.service'
import { XpertExportCommand, XpertImportCommand } from '../commands'
import { buildOverwriteDraftFromImportedDsl } from '../import-draft.utils'
import { XpertService } from '../xpert.service'
import {
  AgentMiddlewareCatalogItem,
  AssistantDraftConflictError,
  AssistantDraftMutationResult,
  AuthoringConflictType,
  AuthoringCatalogResult,
  AuthoringAssistantRequestContext,
  AuthoringToolName,
  CurrentXpertDslResult,
  EditXpertPayload,
  KnowledgebaseCatalogItem,
  NewXpertPayload,
  SkillCatalogItem,
  ToolsetCatalogItem
} from './xpert-authoring.types'

const VALID_NODE_TYPES = new Set(['agent', 'knowledge', 'toolset', 'xpert', 'workflow'])
const VALID_CONNECTION_TYPES = new Set(['edge', 'agent', 'knowledge', 'toolset', 'xpert', 'workflow'])
const VALID_WORKFLOW_NODE_TYPES = new Set(Object.values(WorkflowNodeTypeEnum))
const WORKFLOW_TOP_INPUT_TYPES = new Set([
  WorkflowNodeTypeEnum.AGENT_TOOL,
  WorkflowNodeTypeEnum.MIDDLEWARE,
  WorkflowNodeTypeEnum.SKILL,
  WorkflowNodeTypeEnum.TASK
])
const WORKFLOW_EDGE_INPUT_DISABLED_TYPES = new Set([
  WorkflowNodeTypeEnum.AGENT_TOOL,
  WorkflowNodeTypeEnum.MIDDLEWARE,
  WorkflowNodeTypeEnum.NOTE,
  WorkflowNodeTypeEnum.START,
  WorkflowNodeTypeEnum.TASK,
  WorkflowNodeTypeEnum.TRIGGER
])
const WORKFLOW_EDGE_OUTPUT_DISABLED_TYPES = new Set([
  WorkflowNodeTypeEnum.MIDDLEWARE,
  WorkflowNodeTypeEnum.NOTE,
  WorkflowNodeTypeEnum.SKILL,
  WorkflowNodeTypeEnum.TASK
])
const WORKFLOW_AGENT_OUTPUT_TYPES = new Set([
  WorkflowNodeTypeEnum.ITERATING,
  WorkflowNodeTypeEnum.ITERATOR,
  WorkflowNodeTypeEnum.SKILL,
  WorkflowNodeTypeEnum.SUBFLOW,
  WorkflowNodeTypeEnum.TASK
])
const WORKFLOW_XPERT_OUTPUT_TYPES = new Set([
  WorkflowNodeTypeEnum.ITERATING,
  WorkflowNodeTypeEnum.ITERATOR,
  WorkflowNodeTypeEnum.SUBFLOW
])

@Injectable()
export class XpertAuthoringService {
  constructor(
    private readonly xpertService: XpertService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly xpertAgentService: XpertAgentService,
    private readonly xpertToolsetService: XpertToolsetService,
    private readonly knowledgebaseService: KnowledgebaseService
  ) {}

  async getCurrentXpertFromContext(
    context: AuthoringAssistantRequestContext
  ): Promise<CurrentXpertDslResult> {
    if (!context.targetXpertId) {
      return {
        xpertId: null,
        dslYaml: null,
        summary: 'Missing xpertId for current Xpert DSL export.'
      }
    }

    const xpert = await this.loadXpertById(context.targetXpertId)
    const currentDraft = this.getEditableDraft(xpert)

    return {
      xpertId: xpert.id,
      dslYaml: await this.exportDraftDslYaml(xpert.id),
      summary: `Loaded "${xpert.title || xpert.name || 'current Xpert'}" as YAML DSL.`,
      committedDraftHash: this.calculateDraftHash(currentDraft)
    }
  }

  async getAvailableAgentMiddlewaresFromContext(
    context: AuthoringAssistantRequestContext
  ): Promise<AuthoringCatalogResult<AgentMiddlewareCatalogItem>> {
    const items = this.xpertAgentService.getMiddlewareStrategies().map(({ meta }) => ({
      name: meta.name,
      label: meta.label,
      description: meta.description,
      icon: meta.icon,
      configSchema: meta.configSchema
    }))

    return this.buildCatalogResult(items, {
      workspaceId: this.requireWorkspaceId(context),
      emptySummary: 'No agent middlewares are currently available.',
      foundSummary: `Found ${items.length} agent middlewares available to the assistant.`
    })
  }

  async getAvailableToolsetsFromContext(
    context: AuthoringAssistantRequestContext
  ): Promise<AuthoringCatalogResult<ToolsetCatalogItem>> {
    const workspaceId = this.requireWorkspaceId(context)
    if (!workspaceId) {
      return this.buildRejectedCatalogResult('Missing workspaceId in request context.')
    }

    const result = await this.xpertToolsetService.getAllByWorkspace(
      workspaceId,
      {} as any,
      false,
      RequestContext.currentUser()
    )
    const toolsets = await this.xpertToolsetService.afterLoad(result.items)
    const items = toolsets.map((toolset) => ({
      id: toolset.id,
      name: toolset.name,
      category: toolset.category ?? null,
      type: toolset.type ?? null,
      description: toolset.description ?? null,
      tags:
        toolset.tags
          ?.map((tag) => tag.name)
          .filter((tag): tag is string => Boolean(tag)) ?? [],
      avatar: toolset.avatar
    }))

    return this.buildCatalogResult(items, {
      workspaceId,
      emptySummary: `No toolsets are currently available in workspace '${workspaceId}'.`,
      foundSummary: `Found ${items.length} toolsets available in workspace '${workspaceId}'.`
    })
  }

  async getAvailableKnowledgebasesFromContext(
    context: AuthoringAssistantRequestContext
  ): Promise<AuthoringCatalogResult<KnowledgebaseCatalogItem>> {
    const workspaceId = this.requireWorkspaceId(context)
    if (!workspaceId) {
      return this.buildRejectedCatalogResult('Missing workspaceId in request context.')
    }

    const result = await this.knowledgebaseService.getAllByWorkspace(
      workspaceId,
      {} as any,
      false,
      RequestContext.currentUser()
    )
    const items = result.items.map((knowledgebase) => ({
      id: knowledgebase.id,
      name: knowledgebase.name,
      description: knowledgebase.description ?? null,
      status: knowledgebase.status ?? null,
      permission: knowledgebase.permission ?? null,
      language: knowledgebase.language ?? null,
      avatar: knowledgebase.avatar
    }))

    return this.buildCatalogResult(items, {
      workspaceId,
      emptySummary: `No knowledgebases are currently available in workspace '${workspaceId}'.`,
      foundSummary: `Found ${items.length} knowledgebases available in workspace '${workspaceId}'.`
    })
  }

  async getAvailableSkillsFromContext(
    context: AuthoringAssistantRequestContext
  ): Promise<AuthoringCatalogResult<SkillCatalogItem>> {
    const workspaceId = this.requireWorkspaceId(context)
    if (!workspaceId) {
      return this.buildRejectedCatalogResult('Missing workspaceId in request context.')
    }

    const skills = await this.queryBus.execute<ListWorkspaceSkillsQuery, ISkillPackage[]>(
      new ListWorkspaceSkillsQuery(workspaceId)
    )
    const items = skills.map((skill) => ({
      id: skill.id ?? null,
      name: skill.metadata?.name ?? skill.name ?? null,
      version: skill.metadata?.version ?? null,
      summary: this.pickI18nText(skill.metadata?.summary) ?? null,
      visibility: skill.visibility ?? null
    }))

    return this.buildCatalogResult(items, {
      workspaceId,
      emptySummary: `No skills are currently available in workspace '${workspaceId}'.`,
      foundSummary: `Found ${items.length} skills available in workspace '${workspaceId}'.`
    })
  }

  async newXpertFromContext(
    context: AuthoringAssistantRequestContext,
    payload: NewXpertPayload
  ): Promise<AssistantDraftMutationResult> {
    const trimmedIntent = payload?.userIntent?.trim()
    if (!trimmedIntent) {
      return this.buildRejectedResult('newXpert', 'Missing userIntent for workspace creation.')
    }

    const workspaceId = this.requireWorkspaceId(context)
    if (!workspaceId) {
      return this.buildRejectedResult('newXpert', 'Missing workspaceId for workspace creation.')
    }

    const name = await this.createAvailableName(
      payload?.xpertName?.trim() || this.deriveNameFromIntent(trimmedIntent)
    )
    const agentKey = letterStartSUID('Agent_')
    const initialAgent = {
      key: agentKey,
      name,
      title: name,
      description: trimmedIntent,
      prompt: trimmedIntent,
      options: {
        vision: {
          enabled: true
        }
      }
    }
    const created = await this.xpertService.create({
      type: XpertTypeEnum.Agent,
      name,
      title: name,
      description: trimmedIntent,
      latest: true,
      workspaceId,
      agent: initialAgent,
      graph: {
        nodes: [
          {
            type: 'agent',
            key: agentKey,
            position: { x: 0, y: 0 },
            entity: initialAgent
          }
        ],
        connections: []
      },
      copilotModel: {
        modelType: 'llm',
        model: 'gpt-4o'
      }
    } as Partial<IXpert>)

    // Reload the persisted team so the draft is built from the fully-hydrated
    // entity rather than the partial create() response.
    const persisted = await this.loadXpertById(created.id)
    const draft = this.buildInitialDraft(persisted)
    draft.savedAt = new Date()
    await this.xpertService.saveDraft(persisted.id, draft)

    return this.buildAppliedResult('newXpert', persisted.id, {
      summary: `Created "${persisted.title || persisted.name}" and opened it in Studio.`,
      syncMode: 'none',
      requiresRefresh: false,
      warnings: payload?.templateId ? ['templateId is reserved for a later phase and was ignored.'] : []
    })
  }

  async editXpertFromContext(
    context: AuthoringAssistantRequestContext,
    payload: EditXpertPayload
  ): Promise<AssistantDraftMutationResult> {
    const toolName: AuthoringToolName = 'editXpert'

    if (!context.targetXpertId) {
      return this.buildRejectedResult(toolName, 'Missing xpertId for Studio draft mutation.')
    }

    const xpert = await this.loadXpertById(context.targetXpertId)
    const currentDraft = this.getEditableDraft(xpert)
    const currentDraftHash = this.calculateDraftHash(currentDraft)

    const trimmedDslYaml = payload?.dslYaml?.trim()
    if (!trimmedDslYaml) {
      return this.buildRejectedResult(toolName, 'Missing dslYaml for Studio draft mutation.', currentDraftHash)
    }

    let parsedDsl: Record<string, unknown>
    try {
      const parsed = yaml.parse(trimmedDslYaml)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return this.buildRejectedResult(toolName, 'Invalid YAML DSL provided for editXpert.', currentDraftHash)
      }

      parsedDsl = parsed as Record<string, unknown>
    } catch {
      return this.buildRejectedResult(toolName, 'Invalid YAML DSL provided for editXpert.', currentDraftHash)
    }

    let candidateDraft: TXpertTeamDraft
    try {
      candidateDraft = buildOverwriteDraftFromImportedDsl(xpert, parsedDsl as Partial<TXpertTeamDraft>)
    } catch (error) {
      return this.buildRejectedResult(
        toolName,
        error instanceof Error ? error.message : 'Invalid YAML DSL provided for editXpert.',
        currentDraftHash
      )
    }

    const validationErrors = await this.validateCandidateDraft(candidateDraft)
    if (validationErrors.length) {
      return this.buildRejectedResult(toolName, this.formatValidationSummary(validationErrors), currentDraftHash)
    }

    try {
      await this.commandBus.execute(new XpertImportCommand(parsedDsl, { targetXpertId: context.targetXpertId }))
    } catch (error) {
      return this.buildRejectedResult(
        toolName,
        error instanceof Error ? error.message : 'Failed to import YAML DSL for editXpert.',
        currentDraftHash
      )
    }

    return this.buildAppliedResult(toolName, context.targetXpertId, {
      syncMode: 'refresh',
      requiresRefresh: true
    })
  }

  private async buildAppliedResult(
    toolName: AuthoringToolName,
    xpertId: string,
    options: {
      summary?: string
      syncMode: AssistantDraftMutationResult['syncMode']
      requiresRefresh: boolean
      warnings?: string[]
    }
  ): Promise<AssistantDraftMutationResult> {
    const xpert = await this.loadXpertById(xpertId)
    const savedDraft = this.getEditableDraft(xpert)
    const committedDraftHash = this.calculateDraftHash(savedDraft)

    return {
      status: 'applied',
      toolName,
      summary: options.summary ?? `Updated "${savedDraft.team?.title || savedDraft.team?.name || 'current draft'}".`,
      syncMode: options.syncMode,
      conflictType: null,
      requiresRefresh: options.requiresRefresh,
      committedDraftHash,
      updatedDraftFragment: this.buildUpdatedDraftFragment(savedDraft),
      dslYaml: await this.exportDraftDslYaml(xpertId),
      warnings: options.warnings ?? []
    }
  }

  private buildCatalogResult<T>(
    items: T[],
    options: {
      workspaceId?: string | null
      emptySummary: string
      foundSummary: string
    }
  ): AuthoringCatalogResult<T> {
    return {
      status: 'available',
      summary: items.length ? options.foundSummary : options.emptySummary,
      total: items.length,
      workspaceId: options.workspaceId ?? null,
      items
    }
  }

  private buildRejectedCatalogResult<T>(summary: string): AuthoringCatalogResult<T> {
    return {
      status: 'rejected',
      summary,
      total: 0,
      workspaceId: null,
      items: []
    }
  }

  private buildUpdatedDraftFragment(savedDraft: TXpertTeamDraft) {
    const primaryAgent = savedDraft.team?.agent

    return {
      team: {
        id: savedDraft.team?.id ?? null,
        name: savedDraft.team?.name ?? null,
        title: savedDraft.team?.title ?? null,
        description: savedDraft.team?.description ?? null,
        avatar: savedDraft.team?.avatar ?? null,
        starters: savedDraft.team?.starters ?? [],
        workspaceId: savedDraft.team?.workspaceId ?? null
      },
      primaryAgent: primaryAgent
        ? {
            key: primaryAgent.key,
            name: primaryAgent.name ?? null,
            title: primaryAgent.title ?? null,
            description: primaryAgent.description ?? null,
            prompt: primaryAgent.prompt ?? null,
            copilotModel: primaryAgent.copilotModel ?? null
          }
        : null
    }
  }

  private async exportDraftDslYaml(xpertId: string) {
    const draftDsl = await this.commandBus.execute(new XpertExportCommand(xpertId, true, false))
    return yaml.stringify(instanceToPlain(draftDsl))
  }

  private requireWorkspaceId(context: AuthoringAssistantRequestContext) {
    const envWorkspaceId =
      typeof context.env?.['workspaceId'] === 'string' ? context.env['workspaceId'].trim() : ''
    if (envWorkspaceId) {
      return envWorkspaceId
    }

    const workspaceId = typeof context.workspaceId === 'string' ? context.workspaceId.trim() : ''
    return workspaceId || null
  }

  private async loadXpertById(xpertId?: string | null) {
    if (!xpertId) {
      throw new Error('Missing target Xpert id.')
    }

    const xpert = await this.xpertService.repository.findOne({
      where: {
        id: xpertId
      },
      relations: ['agent', 'agent.copilotModel', 'copilotModel', 'agents', 'agents.copilotModel', 'toolsets', 'knowledgebases']
    })

    if (!xpert) {
      throw new Error(`Xpert '${xpertId}' was not found.`)
    }

    return xpert
  }

  private buildRejectedResult(
    toolName: AuthoringToolName,
    summary: string,
    committedDraftHash: string | null = null
  ): AssistantDraftMutationResult {
    return {
      status: 'rejected',
      toolName,
      summary,
      syncMode: 'none',
      conflictType: null,
      requiresRefresh: false,
      committedDraftHash,
      updatedDraftFragment: null,
      warnings: []
    }
  }

  private async validateCandidateDraft(draft: TXpertTeamDraft) {
    const structuralErrors = this.validateGraphStructure(draft)
    let checklistErrors: string[] = []

    try {
      const checklist = await this.xpertService.validate(draft)
      checklistErrors = this.collectChecklistErrors(checklist)
    } catch (error) {
      checklistErrors = [error instanceof Error ? error.message : 'Draft checklist validation failed.']
    }

    return Array.from(new Set([...structuralErrors, ...checklistErrors]))
  }

  private validateGraphStructure(draft: TXpertTeamDraft) {
    const errors: string[] = []
    const nodeKeys = new Set<string>()
    const connectionKeys = new Set<string>()
    const nodes = draft.nodes ?? []

    for (const node of nodes) {
      const nodeKey = typeof node?.key === 'string' ? node.key.trim() : ''
      if (!nodeKey) {
        errors.push('Node key cannot be empty.')
      } else if (nodeKeys.has(nodeKey)) {
        errors.push(`Duplicate node key "${nodeKey}".`)
      } else {
        nodeKeys.add(nodeKey)
      }

      if (!VALID_NODE_TYPES.has(node?.type)) {
        errors.push(`Node "${nodeKey || '(empty)'}" has unsupported type "${String(node?.type ?? '')}".`)
      }

      if (node?.type === 'workflow') {
        const workflowType = node.entity?.type
        if (!VALID_WORKFLOW_NODE_TYPES.has(workflowType)) {
          errors.push(
            `Workflow node "${nodeKey || '(empty)'}" has unsupported entity.type "${String(workflowType ?? '')}".`
          )
        }
      }
    }

    for (const connection of draft.connections ?? []) {
      const connectionKey = typeof connection?.key === 'string' ? connection.key.trim() : ''
      const from = typeof connection?.from === 'string' ? connection.from.trim() : ''
      const to = typeof connection?.to === 'string' ? connection.to.trim() : ''

      if (!connectionKey) {
        errors.push('Connection key cannot be empty.')
      } else if (connectionKeys.has(connectionKey)) {
        errors.push(`Duplicate connection key "${connectionKey}".`)
      } else {
        connectionKeys.add(connectionKey)
      }

      if (!from) {
        errors.push(`Connection "${connectionKey || '(empty)'}" is missing a source.`)
      }
      if (!to) {
        errors.push(`Connection "${connectionKey || '(empty)'}" is missing a target.`)
      }
      if (!VALID_CONNECTION_TYPES.has(connection?.type)) {
        errors.push(
          `Connection "${connectionKey || '(empty)'}" has unsupported type "${String(connection?.type ?? '')}".`
        )
      }

      const sourceNode = this.findSourceNode(nodes, from)
      if (!sourceNode) {
        errors.push(`Connection "${connectionKey || '(empty)'}" references missing source node "${from || '(empty)'}".`)
      }

      const targetNode = nodes.find((node) => node.key === to)
      if (!targetNode) {
        errors.push(`Connection "${connectionKey || '(empty)'}" references missing target node "${to || '(empty)'}".`)
      }

      if (sourceNode && !this.supportsSourceConnection(sourceNode, connection.type)) {
        errors.push(
          `Connection "${connectionKey || '(empty)'}" uses unsupported source "${from}" for type "${connection.type}".`
        )
      }

      if (targetNode && !this.supportsTargetConnection(targetNode, connection.type)) {
        errors.push(
          `Connection "${connectionKey || '(empty)'}" targets "${to}" with unsupported type "${connection.type}".`
        )
      }
    }

    return errors
  }

  private findSourceNode(nodes: TXpertTeamNode[], from: string) {
    if (!from) {
      return null
    }

    const [sourceNodeKey] = from.split('/')
    return nodes.find((node) => node.key === sourceNodeKey) ?? null
  }

  private supportsSourceConnection(node: TXpertTeamNode, connectionType: TXpertTeamConnection['type']) {
    if (node.type === 'agent') {
      return true
    }

    if (node.type === 'knowledge' || node.type === 'toolset') {
      return false
    }

    if (node.type === 'xpert') {
      return connectionType === 'edge'
    }

    const workflowType = node.entity?.type
    if (!VALID_WORKFLOW_NODE_TYPES.has(workflowType)) {
      return false
    }

    if (connectionType === 'edge') {
      return !WORKFLOW_EDGE_OUTPUT_DISABLED_TYPES.has(workflowType)
    }

    if (connectionType === 'agent') {
      return WORKFLOW_AGENT_OUTPUT_TYPES.has(workflowType)
    }

    if (connectionType === 'xpert') {
      return WORKFLOW_XPERT_OUTPUT_TYPES.has(workflowType)
    }

    return false
  }

  private supportsTargetConnection(node: TXpertTeamNode, connectionType: TXpertTeamConnection['type']) {
    if (connectionType === 'edge') {
      if (node.type === 'agent' || node.type === 'xpert') {
        return true
      }

      if (node.type !== 'workflow') {
        return false
      }

      const workflowType = node.entity?.type
      return VALID_WORKFLOW_NODE_TYPES.has(workflowType) && !WORKFLOW_EDGE_INPUT_DISABLED_TYPES.has(workflowType)
    }

    if (connectionType !== node.type) {
      return false
    }

    if (node.type !== 'workflow') {
      return true
    }

    const workflowType = node.entity?.type
    return VALID_WORKFLOW_NODE_TYPES.has(workflowType) && WORKFLOW_TOP_INPUT_TYPES.has(workflowType)
  }

  private collectChecklistErrors(items: ChecklistItem[] = []) {
    return items
      .filter((item) => item?.level === 'error')
      .map((item) => this.getChecklistMessage(item))
      .filter((message): message is string => Boolean(message))
  }

  private getChecklistMessage(item: ChecklistItem) {
    if (typeof item?.message === 'string') {
      return item.message
    }

    return item?.message?.en_US ?? item?.message?.zh_Hans ?? null
  }

  private formatValidationSummary(errors: string[]) {
    const [firstError, ...rest] = errors
    if (!firstError) {
      return 'Draft validation failed for editXpert.'
    }

    return rest.length
      ? `Draft validation failed: ${firstError} (${rest.length} more issue${rest.length > 1 ? 's' : ''}).`
      : `Draft validation failed: ${firstError}`
  }

  private throwConflict(
    toolName: AuthoringToolName,
    conflictType: AuthoringConflictType,
    summary: string,
    options: {
      requiresRefresh: boolean
      committedDraftHash: string | null
    }
  ): never {
    throw new AssistantDraftConflictError(
      toolName,
      conflictType,
      summary,
      options.requiresRefresh,
      options.committedDraftHash
    )
  }

  private buildInitialDraft(xpert: IXpert): TXpertTeamDraft {
    const nodes = (xpert.graph?.nodes ?? createXpertNodes(xpert, { x: 0, y: 0 }).nodes).map((node) => ({
      ...node,
      hash: this.calculateNodeHashWithoutHash(node)
    }))
    const connections = xpert.graph?.connections ?? createAgentConnections(xpert.agent, xpert.executors ?? [])

    return {
      team: {
        ...omitXpertRelations(xpert),
        agent: xpert.agent
      } as TXpertTeamDraft['team'],
      nodes,
      connections
    }
  }

  private getEditableDraft(xpert: IXpert) {
    return xpert.draft ? structuredClone(xpert.draft) : this.buildInitialDraft(xpert)
  }

  private deriveNameFromIntent(userIntent: string) {
    const compact = userIntent
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()

    return compact.slice(0, 48) || 'New Expert'
  }

  private async createAvailableName(baseName: string) {
    const normalized = baseName.trim() || 'New Expert'
    if (await this.xpertService.validateName(normalized)) {
      return normalized
    }

    for (let index = 2; index < 100; index++) {
      const candidate = `${normalized}-${index}`
      if (await this.xpertService.validateName(candidate)) {
        return candidate
      }
    }

    return `${normalized}-${Date.now()}`
  }

  private calculateNodeHash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
  }

  private calculateNodeHashWithoutHash<T extends { hash?: string }>(node: T) {
    const { hash: _hash, ...rest } = node
    return this.calculateNodeHash(rest)
  }

  private calculateDraftHash(draft: TXpertTeamDraft) {
    return createHash('sha256').update(JSON.stringify(draft)).digest('hex')
  }

  private pickI18nText(value: unknown): string | null {
    if (!value) {
      return null
    }

    if (typeof value === 'string') {
      return value
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      return null
    }

    const entries = Object.values(value as Record<string, unknown>).filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim())
    )

    return entries[0] ?? null
  }
}
