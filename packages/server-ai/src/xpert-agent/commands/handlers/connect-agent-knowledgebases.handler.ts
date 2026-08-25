import {
    AIPermissionsEnum,
    type IKnowledgebase,
    type KnowledgeFilterNode,
    type TKBRetrievalSettings,
    type TXpertGraph,
    type TXpertTeamDraft,
    type TXpertTeamNode
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { InjectDataSource } from '@nestjs/typeorm'
import { RequestContext, type KnowledgebaseConnectAgentResult, type KnowledgebaseListItem } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { ListWorkspaceKnowledgebasesQuery } from '../../../knowledgebase/queries'
import { Xpert } from '../../../xpert/xpert.entity'
import { XpertService } from '../../../xpert/xpert.service'
import { XpertAgent } from '../../xpert-agent.entity'
import { ConnectAgentKnowledgebasesCommand } from '../connect-agent-knowledgebases.command'

/**
 * Connects knowledgebases to an Agent while keeping the Agent entity, published
 * graph, and draft graph on the same canonical ID set. Persistence is atomic so
 * a failed graph update cannot leave the Agent configuration partially updated.
 *
 * Workspace lookup results are used only to authorize requested IDs and enrich
 * graph nodes; they are not the source of truth for IDs already connected.
 */
@CommandHandler(ConnectAgentKnowledgebasesCommand)
export class ConnectAgentKnowledgebasesHandler implements ICommandHandler<ConnectAgentKnowledgebasesCommand> {
    constructor(
        private readonly xpertService: XpertService,
        private readonly queryBus: QueryBus,
        @InjectDataSource() private readonly dataSource: DataSource
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

        const retrievals = mergeRetrievalPolicies(
            xpert.agentConfig?.retrievals,
            normalizeRetrievalPolicies(input.retrievals, requestedIds)
        )
        const selectedKnowledgebases = available.filter((item) => knowledgebaseIds.includes(item.id))
        const graph = connectGraphAgent(xpert.graph, agentKey, knowledgebaseIds, selectedKnowledgebases)
        const draft = connectDraftAgent(xpert.draft, agentKey, knowledgebaseIds, selectedKnowledgebases, retrievals)
        const xpertPatch =
            graph !== xpert.graph || draft !== xpert.draft || retrievals !== xpert.agentConfig?.retrievals
                ? {
                      ...(graph !== xpert.graph ? { graph } : {}),
                      ...(draft !== xpert.draft ? { draft } : {}),
                      ...(retrievals !== xpert.agentConfig?.retrievals
                          ? { agentConfig: { ...(xpert.agentConfig ?? {}), retrievals } }
                          : {})
                  }
                : undefined
        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(XpertAgent).update(xpert.agent.id, { knowledgebaseIds })
            // Keep TypeORM's recursive JSON update type from expanding the graph/draft unions.
            if (xpertPatch) await manager.getRepository(Xpert).update(xpertId, xpertPatch as any)
        })

        return { xpertId, agentKey, knowledgebaseIds, addedKnowledgebaseIds }
    }
}

/**
 * Projects the complete knowledgebase ID set into the editable draft. Metadata
 * is merged only for knowledgebases returned by the bounded workspace lookup,
 * preserving existing draft entities that were not included in that response.
 */
function connectDraftAgent(
    draft: TXpertTeamDraft | null | undefined,
    agentKey: string,
    knowledgebaseIds: string[],
    knowledgebases: KnowledgebaseListItem[],
    retrievals: Record<string, TKBRetrievalSettings>
): TXpertTeamDraft | null | undefined {
    if (!draft) return draft
    const nextTeamAgent =
        draft.team?.agent?.key === agentKey ? { ...draft.team.agent, knowledgebaseIds } : draft.team?.agent
    const nodes = connectAgentNodes(draft.nodes, agentKey, knowledgebaseIds, knowledgebases)
    const connections = connectAgentKnowledgebaseConnections(draft.connections, agentKey, knowledgebaseIds)
    if (nextTeamAgent === draft.team?.agent && nodes === draft.nodes && connections === draft.connections) return draft
    return {
        ...draft,
        ...(draft.team
            ? {
                  team: {
                      ...draft.team,
                      ...(nextTeamAgent ? { agent: nextTeamAgent } : {}),
                      knowledgebases: mergeKnowledgebaseEntities(draft.team.knowledgebases, knowledgebases),
                      agentConfig: { ...(draft.team.agentConfig ?? {}), retrievals }
                  }
              }
            : {}),
        ...(nodes ? { nodes } : {}),
        ...(connections ? { connections } : {})
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
    knowledgebaseIds: string[],
    knowledgebases: KnowledgebaseListItem[]
): TXpertGraph | null | undefined {
    if (!graph) return graph
    const nodes = connectAgentNodes(graph.nodes, agentKey, knowledgebaseIds, knowledgebases)
    const connections = connectAgentKnowledgebaseConnections(graph.connections, agentKey, knowledgebaseIds)
    return nodes === graph.nodes && connections === graph.connections
        ? graph
        : { ...graph, nodes: nodes ?? graph.nodes, connections: connections ?? graph.connections }
}

/**
 * Synchronizes the Agent node with canonical IDs and materializes any missing
 * knowledge nodes for which metadata is available. Existing graph nodes remain
 * untouched, including nodes outside the current workspace lookup window.
 */
function connectAgentNodes(
    nodes: TXpertTeamNode[] | null | undefined,
    agentKey: string,
    knowledgebaseIds: string[],
    knowledgebases: KnowledgebaseListItem[]
): TXpertTeamNode[] | null | undefined {
    if (!nodes) return nodes
    const agentNode = nodes.find(
        (node) => node.type === 'agent' && (node.key === agentKey || node.entity?.key === agentKey)
    )
    if (!agentNode) return nodes
    let changed = false
    const next = nodes.map((node) => {
        if (node.type !== 'agent' || (node.key !== agentKey && node.entity?.key !== agentKey)) return node
        if (sameIds(node.entity.knowledgebaseIds, knowledgebaseIds)) return node
        changed = true
        return {
            ...node,
            entity: { ...node.entity, knowledgebaseIds }
        } satisfies TXpertTeamNode<'agent'>
    })
    const existingKnowledgebaseIds = new Set(nodes.filter((node) => node.type === 'knowledge').map((node) => node.key))
    knowledgebases.forEach((knowledgebase, index) => {
        if (existingKnowledgebaseIds.has(knowledgebase.id)) return
        changed = true
        next.push({
            type: 'knowledge',
            key: knowledgebase.id,
            position: {
                x: agentNode.position.x + 320,
                y: agentNode.position.y + index * 100
            },
            entity: knowledgebase as IKnowledgebase
        })
    })
    return changed ? next : nodes
}

/**
 * Adds the missing Agent-to-knowledgebase edges without rebuilding or removing
 * unrelated graph connections. This keeps the operation additive and idempotent.
 */
function connectAgentKnowledgebaseConnections(
    connections: TXpertGraph['connections'] | null | undefined,
    agentKey: string,
    knowledgebaseIds: string[]
) {
    if (!connections) return connections
    const existing = new Set(
        connections
            .filter((connection) => connection.type === 'knowledge' && connection.from === agentKey)
            .map((connection) => connection.to)
    )
    const missing = knowledgebaseIds.filter((id) => !existing.has(id))
    if (!missing.length) return connections
    return [
        ...connections,
        ...missing.map((id) => ({
            type: 'knowledge' as const,
            key: `${agentKey}/${id}`,
            from: agentKey,
            to: id
        }))
    ]
}

function mergeKnowledgebaseEntities(
    current: IKnowledgebase[] | null | undefined,
    knowledgebases: KnowledgebaseListItem[]
) {
    const byId = new Map((current ?? []).map((item) => [item.id, item]))
    knowledgebases.forEach((item) => byId.set(item.id, { ...byId.get(item.id), ...item } as IKnowledgebase))
    return [...byId.values()]
}

function sameIds(current: string[] | null | undefined, expected: string[]) {
    const currentIds = uniqueIds(current ?? [])
    return currentIds.length === expected.length && currentIds.every((id, index) => id === expected[index])
}

function uniqueIds(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function requiredText(value: string, field: string) {
    const normalized = value?.trim()
    if (!normalized || normalized.length > 200) throw new BadRequestException(`${field} is required`)
    return normalized
}
