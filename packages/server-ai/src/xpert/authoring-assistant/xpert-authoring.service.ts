import { Injectable } from '@nestjs/common'
import {
  IXpert,
  TXpertTeamDraft,
  XpertTypeEnum,
  createAgentConnections,
  createXpertNodes,
  letterStartSUID,
  omitXpertRelations
} from '@metad/contracts'
import { createHash } from 'crypto'
import { XpertService } from '../xpert.service'
import {
  AssistantDraftMutationResult,
  AuthoringAssistantRequestContext,
  AuthoringToolName,
  EditXpertPayload,
  NewXpertPayload
} from './xpert-authoring.types'

@Injectable()
export class XpertAuthoringService {
  constructor(private readonly xpertService: XpertService) {}

  async newXpertFromContext(
    context: AuthoringAssistantRequestContext,
    payload: NewXpertPayload
  ): Promise<AssistantDraftMutationResult> {
    const trimmedIntent = payload?.userIntent?.trim()
    if (!trimmedIntent) {
      return this.buildRejectedResult('newXpert', 'Missing userIntent for workspace creation.')
    }

    const workspaceId =
      typeof context.env?.['workspaceId'] === 'string' ? context.env['workspaceId'].trim() : null
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
    const savedDraft = await this.xpertService.saveDraft(persisted.id, draft)
    const committedDraftHash = this.calculateDraftHash(savedDraft)

    return {
      status: 'applied',
      toolName: 'newXpert',
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
      warnings: payload?.templateId ? ['templateId is reserved for a later phase and was ignored.'] : []
    }
  }

  async editXpertFromContext(
    context: AuthoringAssistantRequestContext,
    payload: EditXpertPayload
  ): Promise<AssistantDraftMutationResult> {
    const toolName: AuthoringToolName = 'editXpert'

    if (context.unsaved) {
      return this.buildUnsavedConflict(toolName)
    }

    if (!context.targetXpertId) {
      return this.buildRejectedResult(toolName, 'Missing xpertId for Studio draft mutation.')
    }

    if (!context.clientDraftHash) {
      return this.buildRejectedResult(toolName, 'Missing baseDraftHash for Studio draft mutation.')
    }

    const xpert = await this.loadXpertById(context.targetXpertId)
    const currentDraft = this.getEditableDraft(xpert)
    const currentDraftHash = this.calculateDraftHash(currentDraft)

    if (context.clientDraftHash !== currentDraftHash) {
      return {
        status: 'conflict',
        toolName,
        summary: 'Studio draft changed on the server. Refresh before trying again.',
        syncMode: 'refresh',
        conflictType: 'stale-server',
        requiresRefresh: true,
        committedDraftHash: currentDraftHash,
        updatedDraftFragment: null,
        warnings: []
      }
    }

    if (!this.hasEditableFields(payload)) {
      return this.buildRejectedResult(
        toolName,
        'No supported fields were provided for editXpert.',
        currentDraftHash
      )
    }

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
    if (payload.starters !== undefined) {
      draft.team.starters = payload.starters ?? []
    }

    const updatesPrimaryAgent =
      payload.name !== undefined ||
      payload.description !== undefined ||
      payload.prompt !== undefined ||
      Object.prototype.hasOwnProperty.call(payload, 'model')

    if (updatesPrimaryAgent) {
      const primaryAgentKey = draft.team.agent?.key
      if (!primaryAgentKey) {
        return this.buildRejectedResult(
          toolName,
          'Primary agent was not found in the current draft.',
          currentDraftHash
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
    }

    return this.saveEditedDraft(toolName, context.targetXpertId, draft)
  }

  private hasEditableFields(payload: EditXpertPayload) {
    return (
      payload.name !== undefined ||
      payload.description !== undefined ||
      payload.avatar !== undefined ||
      payload.prompt !== undefined ||
      Object.prototype.hasOwnProperty.call(payload, 'model') ||
      payload.starters !== undefined
    )
  }

  private async saveEditedDraft(
    toolName: AuthoringToolName,
    xpertId: string,
    draft: TXpertTeamDraft
  ): Promise<AssistantDraftMutationResult> {
    const savedDraft = await this.xpertService.saveDraft(xpertId, draft)
    const committedDraftHash = this.calculateDraftHash(savedDraft)
    const primaryAgent = savedDraft.team?.agent

    return {
      status: 'applied',
      toolName,
      summary: `Updated "${savedDraft.team?.title || savedDraft.team?.name || 'current draft'}".`,
      syncMode: 'refresh',
      conflictType: null,
      requiresRefresh: true,
      committedDraftHash,
      updatedDraftFragment: {
        team: {
          id: savedDraft.team?.id ?? null,
          name: savedDraft.team?.name ?? null,
          title: savedDraft.team?.title ?? null,
          description: savedDraft.team?.description ?? null,
          avatar: savedDraft.team?.avatar ?? null,
          starters: savedDraft.team?.starters ?? []
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
      },
      warnings: []
    }
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

  private buildUnsavedConflict(toolName: AuthoringToolName): AssistantDraftMutationResult {
    return {
      status: 'conflict',
      toolName,
      summary: 'Studio has unsaved local changes. Save or discard them before using assistant edits.',
      syncMode: 'none',
      conflictType: 'unsaved-local',
      requiresRefresh: false,
      committedDraftHash: null,
      updatedDraftFragment: null,
      warnings: []
    }
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
