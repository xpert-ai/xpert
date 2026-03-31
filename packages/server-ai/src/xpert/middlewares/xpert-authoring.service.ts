import {
  ISkillPackage,
  IXpert,
  TXpertTeamDraft,
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

    return {
      xpertId: xpert.id,
      dslYaml: await this.exportDraftDslYaml(xpert.id),
      summary: `Loaded "${xpert.title || xpert.name || 'current Xpert'}" as YAML DSL.`
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

    if (context.unsaved) {
      this.throwConflict(
        toolName,
        'unsaved-local',
        'Studio has unsaved local changes. Save or discard them before using assistant edits.',
        {
          requiresRefresh: false,
          committedDraftHash: null
        }
      )
    }

    if (!context.targetXpertId) {
      return this.buildRejectedResult(toolName, 'Missing xpertId for Studio draft mutation.')
    }

    if (!context.baseDraftHash) {
      return this.buildRejectedResult(toolName, 'Missing baseDraftHash for Studio draft mutation.')
    }

    const xpert = await this.loadXpertById(context.targetXpertId)
    const currentDraft = this.getEditableDraft(xpert)
    const currentDraftHash = this.calculateDraftHash(currentDraft)

    if (context.baseDraftHash !== currentDraftHash) {
      this.throwConflict(
        toolName,
        'stale-server',
        'Studio draft changed on the server. Refresh before trying again.',
        {
          requiresRefresh: true,
          committedDraftHash: currentDraftHash
        }
      )
    }

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
