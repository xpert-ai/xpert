import { Injectable } from '@nestjs/common'
import {
  AssistantDraftMutationRequest,
  AssistantDraftMutationResult,
  AssistantDraftMutationType,
  AuthoringAssistantRequestContext,
  CreateXpertDraftPayload,
  IXpert,
  ReadPageContextResult,
  ReadPrimaryAgentResult,
  ReadStudioSummaryResult,
  TXpertTeamDraft,
  UpdatePrimaryAgentPayload,
  UpdateXpertStartersPayload,
  UpdateXpertTeamMetadataPayload,
  XpertTypeEnum,
  createAgentConnections,
  createXpertNodes,
  letterStartSUID,
  omitXpertRelations
} from '@metad/contracts'
import { createHash } from 'crypto'
import { XpertService } from '../xpert.service'

@Injectable()
export class XpertAuthoringDomainService {
  constructor(private readonly xpertService: XpertService) {}

  mutateDraft(request: AssistantDraftMutationRequest): Promise<AssistantDraftMutationResult> {
    switch (request.profileId) {
      case 'workspace-create':
        return this.createWorkspaceDraft(request)
      case 'studio-agent-edit':
        return this.applyStudioMutation(request)
      default:
        return Promise.resolve(
          this.buildRejectedResult(
            request.mutationType,
            `Profile '${request.profileId}' is not available yet.`
          )
        )
    }
  }

  buildPageContext(context: AuthoringAssistantRequestContext): ReadPageContextResult {
    if (context.mode === 'workspace-create') {
      return {
        pageType: 'workspace',
        xpertId: null,
        workspaceId: context.workspaceId ?? null,
        profileId: 'workspace-create',
        capabilityFlags: ['workspace-create'],
        unsaved: false
      }
    }

    return {
      pageType: 'studio-agents',
      xpertId: context.targetXpertId ?? null,
      workspaceId: context.workspaceId ?? null,
      profileId: 'studio-agent-edit',
      capabilityFlags: [
        'studio-agent-edit',
        'update_xpert_team_metadata',
        'update_primary_agent',
        'update_xpert_starters'
      ],
      unsaved: !!context.unsaved
    }
  }

  createWorkspaceDraftFromContext(
    context: AuthoringAssistantRequestContext,
    payload: Record<string, unknown>
  ): Promise<AssistantDraftMutationResult> {
    const payloadWorkspaceId =
      typeof payload?.['workspaceId'] === 'string' ? payload['workspaceId'] : null

    return this.createWorkspaceDraft({
      xpertId: null,
      profileId: 'workspace-create',
      mutationType: 'create_xpert_draft_from_request',
      baseDraftHash: null,
      payload: {
        ...payload,
        workspaceId: context.workspaceId ?? payloadWorkspaceId ?? null
      }
    })
  }

  async readStudioSummary(context: AuthoringAssistantRequestContext): Promise<ReadStudioSummaryResult> {
    const draft = await this.loadEditableDraftByXpertId(context.targetXpertId)
    const team = draft.team

    return {
      team: {
        name: team?.title || team?.name || null,
        description: team?.description || null
      },
      primaryAgentKey: draft.team.agent?.key ?? null,
      agentCount: draft.nodes?.filter((node) => node.type === 'agent').length ?? 0,
      starterCount: team?.starters?.length ?? 0,
      draftHash: this.calculateDraftHash(draft)
    }
  }

  async readPrimaryAgent(context: AuthoringAssistantRequestContext): Promise<ReadPrimaryAgentResult> {
    const draft = await this.loadEditableDraftByXpertId(context.targetXpertId)
    const primaryAgent = draft.team.agent
    const model = primaryAgent?.copilotModel ?? draft.team?.copilotModel

    return {
      key: primaryAgent?.key ?? null,
      name: primaryAgent?.title || primaryAgent?.name || null,
      description: primaryAgent?.description || null,
      promptSummary: this.summarizeText(primaryAgent?.prompt),
      modelSummary: this.summarizeModel(model),
      toolsetSummary: this.primaryAgentToolsets(draft, primaryAgent?.key ?? null)
    }
  }

  applyStudioMutationFromContext(
    context: AuthoringAssistantRequestContext,
    mutationType: Extract<
      AssistantDraftMutationType,
      'update_xpert_team_metadata' | 'update_primary_agent' | 'update_xpert_starters'
    >,
    payload: Record<string, unknown>
  ): Promise<AssistantDraftMutationResult> {
    return this.applyStudioMutation({
      xpertId: context.targetXpertId ?? null,
      profileId: 'studio-agent-edit',
      mutationType,
      baseDraftHash: context.clientDraftHash ?? null,
      payload
    }, {
      unsaved: !!context.unsaved
    })
  }

  private async createWorkspaceDraft(
    request: AssistantDraftMutationRequest
  ): Promise<AssistantDraftMutationResult> {
    if (request.mutationType !== 'create_xpert_draft_from_request') {
      return this.buildRejectedResult(
        request.mutationType,
        `Mutation '${request.mutationType}' is not available yet.`
      )
    }

    const payload = request.payload as CreateXpertDraftPayload
    const trimmedIntent = payload?.userIntent?.trim()
    if (!trimmedIntent) {
      return this.buildRejectedResult(request.mutationType, 'Missing userIntent for workspace creation.')
    }

    const workspaceId = payload?.workspaceId?.trim()
    if (!workspaceId) {
      return this.buildRejectedResult(request.mutationType, 'Missing workspaceId for workspace creation.')
    }

    const name = await this.createAvailableName(payload.xpertName?.trim() || this.deriveNameFromIntent(trimmedIntent))
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
    const savedDraft = await this.xpertService.saveDraft(persisted.id, draft)
    const committedDraftHash = this.calculateDraftHash(savedDraft)

    return {
      status: 'applied',
      mutationType: request.mutationType,
      summary: `Created "${persisted.title || persisted.name}" and opened it in Studio.`,
      syncMode: 'none',
      conflictType: null,
      requiresRefresh: false,
      committedDraftHash,
      updatedDraftFragment: {
        team: {
          id: savedDraft.team?.id,
          name: savedDraft.team?.name,
          title: savedDraft.team?.title,
          workspaceId: savedDraft.team?.workspaceId
        }
      },
      warnings: payload.templateId ? ['templateId is reserved for a later phase and was ignored.'] : []
    }
  }

  private async applyStudioMutation(
    request: AssistantDraftMutationRequest,
    options?: { unsaved?: boolean }
  ): Promise<AssistantDraftMutationResult> {
    if (options?.unsaved) {
      return this.buildUnsavedConflict(request.mutationType)
    }

    if (!request.xpertId) {
      return this.buildRejectedResult(request.mutationType, 'Missing xpertId for Studio draft mutation.')
    }

    if (!request.baseDraftHash) {
      return this.buildRejectedResult(request.mutationType, 'Missing baseDraftHash for Studio draft mutation.')
    }

    const xpert = await this.loadXpertById(request.xpertId)
    const currentDraft = this.getEditableDraft(xpert)
    const currentDraftHash = this.calculateDraftHash(currentDraft)
    if (request.baseDraftHash !== currentDraftHash) {
      return {
        status: 'conflict',
        mutationType: request.mutationType,
        summary: 'Studio draft changed on the server. Refresh before trying again.',
        syncMode: 'refresh',
        conflictType: 'stale-server',
        requiresRefresh: true,
        committedDraftHash: currentDraftHash,
        updatedDraftFragment: null,
        warnings: []
      }
    }

    switch (request.mutationType) {
      case 'update_xpert_team_metadata':
        return this.updateStudioTeamMetadata(request, currentDraft)
      case 'update_primary_agent':
        return this.updateStudioPrimaryAgent(request, currentDraft)
      case 'update_xpert_starters':
        return this.updateStudioStarters(request, currentDraft)
      default:
        return this.buildRejectedResult(
          request.mutationType,
          `Mutation '${request.mutationType}' is not available yet.`,
          currentDraftHash
        )
    }
  }

  private async updateStudioTeamMetadata(
    request: AssistantDraftMutationRequest,
    currentDraft: TXpertTeamDraft
  ): Promise<AssistantDraftMutationResult> {
    const payload = request.payload as UpdateXpertTeamMetadataPayload
    const draft = structuredClone(currentDraft)

    if (payload.name !== undefined) {
      draft.team.name = payload.name
      draft.team.title = payload.name
    }
    if (payload.description !== undefined) {
      draft.team.description = payload.description
    }
    if (payload.avatar !== undefined) {
      draft.team.avatar = payload.avatar as IXpert['avatar']
    }

    return this.saveStudioMutation(request, draft, {
      summary: `Updated team metadata for "${draft.team.title || draft.team.name || 'current draft'}".`,
      updatedDraftFragment: {
        team: {
          name: draft.team.name ?? null,
          title: draft.team.title ?? null,
          description: draft.team.description ?? null,
          avatar: draft.team.avatar ?? null
        }
      }
    })
  }

  private async updateStudioPrimaryAgent(
    request: AssistantDraftMutationRequest,
    currentDraft: TXpertTeamDraft
  ): Promise<AssistantDraftMutationResult> {
    const payload = request.payload as UpdatePrimaryAgentPayload
    const draft = structuredClone(currentDraft)
    const primaryAgentKey = draft.team.agent?.key

    if (!primaryAgentKey) {
      return this.buildRejectedResult(
        request.mutationType,
        'Primary agent was not found in the current draft.',
        this.calculateDraftHash(currentDraft)
      )
    }

    const nextAgent = {
      ...(draft.team.agent ?? { key: primaryAgentKey })
    } as NonNullable<TXpertTeamDraft['team']['agent']>

    if (payload.name !== undefined) {
      nextAgent.name = payload.name
      nextAgent.title = payload.name
    }
    if (payload.description !== undefined) {
      nextAgent.description = payload.description
    }
    if (payload.prompt !== undefined) {
      nextAgent.prompt = payload.prompt
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'model')) {
      nextAgent.copilotModel = payload.model as typeof nextAgent.copilotModel
    }
    draft.team.agent = nextAgent

    const primaryAgentNode = draft.nodes.find(
      (node) => node.type === 'agent' && node.key === primaryAgentKey
    ) as (TXpertTeamDraft['nodes'][number] & {
      type: 'agent'
      entity: NonNullable<TXpertTeamDraft['team']['agent']>
    }) | undefined

    if (primaryAgentNode) {
      primaryAgentNode.entity = {
        ...(primaryAgentNode.entity ?? {}),
        ...nextAgent
      }
      primaryAgentNode.hash = this.calculateNodeHashWithoutHash(primaryAgentNode)
    }

    return this.saveStudioMutation(request, draft, {
      summary: `Updated primary agent "${nextAgent.title || nextAgent.name || primaryAgentKey}".`,
      updatedDraftFragment: {
        primaryAgent: {
          key: primaryAgentKey,
          name: nextAgent.name ?? null,
          title: nextAgent.title ?? null,
          description: nextAgent.description ?? null,
          prompt: nextAgent.prompt ?? null,
          copilotModel: nextAgent.copilotModel ?? null
        }
      }
    })
  }

  private async updateStudioStarters(
    request: AssistantDraftMutationRequest,
    currentDraft: TXpertTeamDraft
  ): Promise<AssistantDraftMutationResult> {
    const payload = request.payload as UpdateXpertStartersPayload
    const draft = structuredClone(currentDraft)
    draft.team.starters = payload.starters ?? []

    return this.saveStudioMutation(request, draft, {
      summary: `Updated ${draft.team.starters.length} conversation starter(s).`,
      updatedDraftFragment: {
        team: {
          starters: draft.team.starters
        }
      }
    })
  }

  private async saveStudioMutation(
    request: AssistantDraftMutationRequest,
    draft: TXpertTeamDraft,
    options: {
      summary: string
      updatedDraftFragment: Record<string, unknown> | null
    }
  ): Promise<AssistantDraftMutationResult> {
    const savedDraft = await this.xpertService.saveDraft(request.xpertId, draft)
    const committedDraftHash = this.calculateDraftHash(savedDraft)

    return {
      status: 'applied',
      mutationType: request.mutationType,
      summary: options.summary,
      syncMode: 'refresh',
      conflictType: null,
      requiresRefresh: true,
      committedDraftHash,
      updatedDraftFragment: options.updatedDraftFragment,
      warnings: []
    }
  }

  private async loadEditableDraftByXpertId(xpertId?: string | null) {
    const xpert = await this.loadXpertById(xpertId)
    return this.getEditableDraft(xpert)
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
    mutationType: AssistantDraftMutationType,
    summary: string,
    committedDraftHash: string | null = null
  ): AssistantDraftMutationResult {
    return {
      status: 'rejected',
      mutationType,
      summary,
      syncMode: 'none',
      conflictType: null,
      requiresRefresh: false,
      committedDraftHash,
      updatedDraftFragment: null,
      warnings: []
    }
  }

  private buildUnsavedConflict(mutationType: AssistantDraftMutationType): AssistantDraftMutationResult {
    return {
      status: 'conflict',
      mutationType,
      summary: 'Studio has unsaved local changes. Save or discard them before using assistant edits.',
      syncMode: 'none',
      conflictType: 'unsaved-local',
      requiresRefresh: false,
      committedDraftHash: null,
      updatedDraftFragment: null,
      warnings: []
    }
  }

  private primaryAgentToolsets(draft: TXpertTeamDraft, primaryAgentKey: string | null) {
    if (!primaryAgentKey) {
      return []
    }

    const toolsetKeys = draft.connections
      ?.filter((connection) => connection.type === 'toolset' && connection.from === primaryAgentKey)
      .map((connection) => connection.to)

    return (
      toolsetKeys
        ?.map((key) => draft.nodes.find((node) => node.key === key && node.type === 'toolset'))
        .filter(Boolean)
        .map((node) => {
          const entity = node.entity as { title?: string; name?: string }
          return entity.title || entity.name || node.key
        }) ?? []
    )
  }

  private summarizeText(value?: string | null) {
    if (!value?.trim()) {
      return null
    }

    const compact = value.replace(/\s+/g, ' ').trim()
    return compact.length > 240 ? compact.slice(0, 237) + '...' : compact
  }

  private summarizeModel(model?: { modelType?: string; model?: string; copilotId?: string } | null) {
    if (!model) {
      return null
    }

    return [model.modelType, model.model, model.copilotId].filter(Boolean).join(' / ') || null
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
}
