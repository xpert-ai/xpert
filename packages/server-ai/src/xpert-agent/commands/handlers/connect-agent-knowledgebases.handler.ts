import {
    AIPermissionsEnum,
    type KnowledgeFilterNode,
    type TKBRetrievalSettings,
    type TXpertGraph,
    type TXpertTeamDraft,
    type TXpertTeamNode
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { RequestContext, type KnowledgebaseConnectAgentResult, type KnowledgebaseListItem } from '@xpert-ai/plugin-sdk'
import { ListWorkspaceKnowledgebasesQuery } from '../../../knowledgebase/queries'
import { XpertService } from '../../../xpert/xpert.service'
import { XpertAgentService } from '../../xpert-agent.service'
import { ConnectAgentKnowledgebasesCommand } from '../connect-agent-knowledgebases.command'

@CommandHandler(ConnectAgentKnowledgebasesCommand)
export class ConnectAgentKnowledgebasesHandler implements ICommandHandler<ConnectAgentKnowledgebasesCommand> {
    constructor(
        private readonly xpertService: XpertService,
        private readonly xpertAgentService: XpertAgentService,
        private readonly queryBus: QueryBus
    ) {}

    async execute(command: ConnectAgentKnowledgebasesCommand): Promise<KnowledgebaseConnectAgentResult> {
        if (!RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)) {
            throw new ForbiddenException('Xpert edit permission is required')
        }

        const input = command.input
        const workspaceId = requiredText(input.workspaceId, 'workspaceId')
        const xpertId = requiredText(input.xpertId, 'xpertId')
        const agentKey = requiredText(input.agentKey, 'agentKey')
        const requestedIds = uniqueIds(input.knowledgebaseIds)
        if (!requestedIds.length || requestedIds.length > 20) {
            throw new BadRequestException('knowledgebaseIds must contain between 1 and 20 IDs')
        }

        const xpert = await this.xpertService.findOneByIdWithinTenant(xpertId, { relations: ['agent'] })
        if (xpert.workspaceId !== workspaceId) {
            throw new BadRequestException('The Agent and knowledgebases must belong to the same workspace')
        }
        if (!xpert.agent?.id || xpert.agent.key !== agentKey) {
            throw new NotFoundException(`Agent '${agentKey}' was not found on Xpert '${xpertId}'`)
        }

        const available = await this.queryBus.execute<ListWorkspaceKnowledgebasesQuery, KnowledgebaseListItem[]>(
            new ListWorkspaceKnowledgebasesQuery({ workspaceId, limit: 500 })
        )
        const availableIds = new Set(available.map((item) => item.id))
        if (requestedIds.some((id) => !availableIds.has(id))) {
            throw new ForbiddenException('One or more knowledgebases are not available in the Agent workspace')
        }

        const currentIds = uniqueIds(xpert.agent.knowledgebaseIds ?? [])
        const knowledgebaseIds = uniqueIds([...currentIds, ...requestedIds])
        const addedKnowledgebaseIds = requestedIds.filter((id) => !currentIds.includes(id))
        await this.xpertAgentService.update(xpert.agent.id, { knowledgebaseIds })

        const retrievals = mergeRetrievalPolicies(
            xpert.agentConfig?.retrievals,
            normalizeRetrievalPolicies(input.retrievals, requestedIds)
        )
        const graph = connectGraphAgent(xpert.graph, agentKey, knowledgebaseIds)
        const draft = connectDraftAgent(xpert.draft, agentKey, knowledgebaseIds, retrievals)
        if (graph !== xpert.graph || draft !== xpert.draft || retrievals !== xpert.agentConfig?.retrievals) {
            await this.xpertService.update(xpertId, {
                ...(graph !== xpert.graph ? { graph } : {}),
                ...(draft !== xpert.draft ? { draft } : {}),
                ...(retrievals !== xpert.agentConfig?.retrievals
                    ? { agentConfig: { ...(xpert.agentConfig ?? {}), retrievals } }
                    : {})
            })
        }

        return { xpertId, agentKey, knowledgebaseIds, addedKnowledgebaseIds }
    }
}

function connectDraftAgent(
    draft: TXpertTeamDraft | null | undefined,
    agentKey: string,
    knowledgebaseIds: string[],
    retrievals: Record<string, TKBRetrievalSettings>
): TXpertTeamDraft | null | undefined {
    if (!draft) return draft
    const nextTeamAgent =
        draft.team?.agent?.key === agentKey ? { ...draft.team.agent, knowledgebaseIds } : draft.team?.agent
    const nodes = connectAgentNodes(draft.nodes, agentKey, knowledgebaseIds)
    if (nextTeamAgent === draft.team?.agent && nodes === draft.nodes) return draft
    return {
        ...draft,
        ...(draft.team
            ? {
                  team: {
                      ...draft.team,
                      ...(nextTeamAgent ? { agent: nextTeamAgent } : {}),
                      agentConfig: { ...(draft.team.agentConfig ?? {}), retrievals }
                  }
              }
            : {}),
        ...(nodes ? { nodes } : {})
    }
}

function normalizeRetrievalPolicies(
    input:
        | Record<
              string,
              {
                  mode?: 'vector' | 'graph' | 'hybrid'
                  neighborHops?: number
                  entityTopK?: number
                  communityTopK?: number
                  graphWeight?: number
                  fixedFilter?: KnowledgeFilterNode
                  allowAgentFilter?: boolean
              }
          >
        | undefined,
    requestedIds: string[]
): Record<string, TKBRetrievalSettings> {
    if (!input) return {}
    const requested = new Set(requestedIds)
    return Object.fromEntries(
        Object.entries(input)
            .filter(([knowledgebaseId]) => requested.has(knowledgebaseId))
            .map(([knowledgebaseId, policy]) => [
                knowledgebaseId,
                {
                    mode: policy.mode ?? 'vector',
                    ...(policy.neighborHops === undefined ? {} : { neighborHops: policy.neighborHops }),
                    ...(policy.entityTopK === undefined ? {} : { entityTopK: policy.entityTopK }),
                    ...(policy.communityTopK === undefined ? {} : { communityTopK: policy.communityTopK }),
                    ...(policy.graphWeight === undefined ? {} : { graphWeight: policy.graphWeight }),
                    filtering: {
                        ...(policy.fixedFilter ? { fixed: policy.fixedFilter } : {}),
                        agent: { enabled: policy.allowAgentFilter === true }
                    }
                } satisfies TKBRetrievalSettings
            ])
    )
}

function mergeRetrievalPolicies(
    current: Record<string, TKBRetrievalSettings> | undefined,
    updates: Record<string, TKBRetrievalSettings>
) {
    if (!Object.keys(updates).length) return current ?? {}
    return { ...(current ?? {}), ...updates }
}

function connectGraphAgent(
    graph: TXpertGraph | null | undefined,
    agentKey: string,
    knowledgebaseIds: string[]
): TXpertGraph | null | undefined {
    if (!graph) return graph
    const nodes = connectAgentNodes(graph.nodes, agentKey, knowledgebaseIds)
    return nodes === graph.nodes ? graph : { ...graph, nodes: nodes ?? graph.nodes }
}

function connectAgentNodes(
    nodes: TXpertTeamNode[] | null | undefined,
    agentKey: string,
    knowledgebaseIds: string[]
): TXpertTeamNode[] | null | undefined {
    if (!nodes) return nodes
    let changed = false
    const next = nodes.map((node) => {
        if (node.type !== 'agent' || (node.key !== agentKey && node.entity?.key !== agentKey)) return node
        changed = true
        return {
            ...node,
            entity: { ...node.entity, knowledgebaseIds }
        } satisfies TXpertTeamNode<'agent'>
    })
    return changed ? next : nodes
}

function uniqueIds(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function requiredText(value: string, field: string) {
    const normalized = value?.trim()
    if (!normalized || normalized.length > 200) throw new BadRequestException(`${field} is required`)
    return normalized
}
