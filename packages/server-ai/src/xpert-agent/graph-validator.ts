import {
    ChecklistItem,
    findStartNodes,
    getCurrentGraph,
    getSwarmPartners,
    TXpertGraph,
    TXpertTeamDraft,
    TXpertTeamNode
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../xpert/types'

export const AGENT_SUBGRAPH_BUILD_CYCLE = 'AGENT_SUBGRAPH_BUILD_CYCLE'

type TAgentNode = TXpertTeamNode<'agent'>
type TBuildMode = 'start' | 'normal'

@Injectable()
export class XpertAgentGraphValidator {
    @OnEvent(EventNameXpertValidate)
    handle(event: XpertDraftValidateEvent) {
        return validateAgentSubgraphBuildCycles(event.draft)
    }
}

export function validateAgentSubgraphBuildCycles(draft: TXpertTeamDraft): ChecklistItem[] {
    const agentNodes = draft.nodes.filter((node): node is TAgentNode => node.type === 'agent')
    if (!agentNodes.length) {
        return []
    }

    const agentNodeMap = new Map(agentNodes.map((node) => [node.key, node]))
    const runtimeNodeMap = new Map(
        draft.nodes
            .filter(
                (node): node is TXpertTeamNode<'agent' | 'workflow'> =>
                    node.type === 'agent' || node.type === 'workflow'
            )
            .map((node) => [node.key, node])
    )
    const runtimeOutgoing = buildRuntimeOutgoing(draft, runtimeNodeMap)
    const followerTargets = buildFollowerTargets(draft, agentNodeMap)
    const workflowStartTargets = buildWorkflowStartTargets(draft, runtimeNodeMap, agentNodeMap)
    const agentsWithWorkflowInput = new Set(
        draft.connections
            .filter((connection) => connection.type === 'edge' && agentNodeMap.has(connection.to))
            .map((connection) => connection.to)
    )
    const primaryAgentKey = draft.team.agent?.key
    const swarmAgentKeys = getPrimarySwarmAgentKeys(draft, primaryAgentKey, agentNodeMap)
    const dependencies = new Map<string, Set<string>>()
    const getDependencies = (state: string) => {
        const cached = dependencies.get(state)
        if (cached) {
            return cached
        }

        const nextStates = getOrCreateSet(dependencies, state)
        const agentKey = agentKeyFromState(state)
        for (const followerKey of followerTargets.get(agentKey) ?? []) {
            if (!swarmAgentKeys.has(followerKey)) {
                nextStates.add(buildState('start', followerKey))
            }
        }

        if (buildModeFromState(state) === 'start' && agentsWithWorkflowInput.has(agentKey)) {
            for (const entryState of collectEntryBuildStates(
                draft,
                agentKey,
                runtimeNodeMap,
                runtimeOutgoing,
                workflowStartTargets
            )) {
                nextStates.add(entryState)
            }
        }

        return nextStates
    }

    const startStates = getValidationStartStates(primaryAgentKey, swarmAgentKeys, agentNodeMap)
    const cycles = findReachableCycles(getDependencies, startStates)

    return cycles.map((cycle) => {
        const agentKeys = cycle.map(agentKeyFromState)
        const labels = agentKeys.map((key) => agentNodeLabel(agentNodeMap.get(key), key))
        const path = labels.join(' → ')

        return {
            node: agentKeys[0],
            ruleCode: AGENT_SUBGRAPH_BUILD_CYCLE,
            field: 'connections',
            value: path,
            message: {
                en_US: `Agent configuration creates a recursive subgraph build path: ${path}. Remove a sub-agent connection or separate the shared workflow entry path.`,
                zh_Hans: `智能体配置形成递归子图构建路径：${path}。请移除重复的子智能体连接，或拆分共享的工作流入口路径。`
            },
            level: 'error'
        }
    })
}

function buildRuntimeOutgoing(graph: TXpertGraph, nodeMap: Map<string, TXpertTeamNode<'agent' | 'workflow'>>) {
    const outgoing = new Map<string, Set<string>>()

    for (const connection of graph.connections) {
        if (connection.type !== 'edge') {
            continue
        }

        const sourceKey = normalizeNodeKey(connection.from)
        const sourceNode = nodeMap.get(sourceKey)
        const targetNode = nodeMap.get(connection.to)
        if (!sourceNode || !targetNode) {
            continue
        }

        // Container-owned child edges still build their child nodes, even though they are not outer workflow successors.
        if (sourceNode.type === 'agent' && connection.from !== sourceKey && connection.from !== `${sourceKey}/fail`) {
            continue
        }

        getOrCreateSet(outgoing, sourceKey).add(targetNode.key)
    }

    return outgoing
}

function buildFollowerTargets(graph: TXpertGraph, agentNodeMap: Map<string, TAgentNode>) {
    const followers = new Map<string, Set<string>>()

    for (const connection of graph.connections) {
        if (connection.type === 'agent' && agentNodeMap.has(connection.from) && agentNodeMap.has(connection.to)) {
            getOrCreateSet(followers, connection.from).add(connection.to)
        }
    }

    return followers
}

function buildWorkflowStartTargets(
    graph: TXpertGraph,
    nodeMap: Map<string, TXpertTeamNode<'agent' | 'workflow'>>,
    agentNodeMap: Map<string, TAgentNode>
) {
    const targets = new Map<string, Set<string>>()

    for (const connection of graph.connections) {
        if (connection.type !== 'agent' || !agentNodeMap.has(connection.to)) {
            continue
        }

        const sourceKey = normalizeNodeKey(connection.from)
        if (nodeMap.get(sourceKey)?.type === 'workflow') {
            getOrCreateSet(targets, sourceKey).add(connection.to)
        }
    }

    return targets
}

function collectEntryBuildStates(
    graph: TXpertGraph,
    targetAgentKey: string,
    nodeMap: Map<string, TXpertTeamNode<'agent' | 'workflow'>>,
    runtimeOutgoing: Map<string, Set<string>>,
    workflowStartTargets: Map<string, Set<string>>
) {
    const currentGraph = getCurrentGraph(graph, targetAgentKey)
    const startNodes = findStartNodes(currentGraph, targetAgentKey).filter((key) => key !== targetAgentKey)
    const entryStates = new Set<string>()
    const visited = new Set<string>()
    const pending = [...startNodes]

    while (pending.length) {
        const current = pending.pop()
        if (!current || current === targetAgentKey || visited.has(current)) {
            continue
        }
        visited.add(current)

        const node = nodeMap.get(current)
        if (!node) {
            continue
        }
        if (node.type === 'agent') {
            entryStates.add(buildState('normal', node.key))
        } else {
            for (const startTarget of workflowStartTargets.get(node.key) ?? []) {
                entryStates.add(buildState('start', startTarget))
            }
        }

        for (const next of runtimeOutgoing.get(current) ?? []) {
            if (!visited.has(next)) {
                pending.push(next)
            }
        }
    }

    return entryStates
}

function getPrimarySwarmAgentKeys(
    graph: TXpertGraph,
    primaryAgentKey: string | undefined,
    agentNodeMap: Map<string, TAgentNode>
) {
    if (!primaryAgentKey || !agentNodeMap.has(primaryAgentKey)) {
        return new Set<string>()
    }

    const partners: string[] = []
    getSwarmPartners(graph, primaryAgentKey, partners)
    if (partners.length <= 1) {
        return new Set<string>()
    }

    return new Set(partners.filter((key) => agentNodeMap.has(key)))
}

function getValidationStartStates(
    primaryAgentKey: string | undefined,
    swarmAgentKeys: Set<string>,
    agentNodeMap: Map<string, TAgentNode>
) {
    if (swarmAgentKeys.size) {
        return Array.from(swarmAgentKeys, (key) => buildState('start', key))
    }
    if (primaryAgentKey && agentNodeMap.has(primaryAgentKey)) {
        return [buildState('start', primaryAgentKey)]
    }
    return Array.from(agentNodeMap.keys(), (key) => buildState('start', key))
}

function findReachableCycles(getDependencies: (state: string) => Set<string>, startStates: string[]) {
    const visited = new Set<string>()
    const activeIndexes = new Map<string, number>()
    const stack: string[] = []
    const cycles = new Map<string, string[]>()

    const visit = (state: string) => {
        if (visited.has(state)) {
            return
        }
        visited.add(state)
        activeIndexes.set(state, stack.length)
        stack.push(state)

        for (const next of getDependencies(state)) {
            const activeIndex = activeIndexes.get(next)
            if (activeIndex !== undefined) {
                const cycle = [...stack.slice(activeIndex), next]
                cycles.set(normalizeCycle(cycle), cycle)
            } else {
                visit(next)
            }
        }

        stack.pop()
        activeIndexes.delete(state)
    }

    startStates.forEach(visit)
    return Array.from(cycles.values())
}

function normalizeCycle(cycle: string[]) {
    const states = cycle.slice(0, -1)
    if (!states.length) {
        return ''
    }

    const rotations = states.map((_, index) => [...states.slice(index), ...states.slice(0, index)])
    const normalized = rotations.map((rotation) => rotation.join('>')).sort()[0]
    return normalized
}

function buildState(mode: TBuildMode, agentKey: string) {
    return `${mode}:${agentKey}`
}

function agentKeyFromState(state: string) {
    return state.slice(state.indexOf(':') + 1)
}

function buildModeFromState(state: string): TBuildMode {
    return state.startsWith('start:') ? 'start' : 'normal'
}

function normalizeNodeKey(key: string) {
    return key.split('/')[0]
}

function agentNodeLabel(node: TAgentNode | undefined, fallback: string) {
    return node?.entity.title?.trim() || node?.entity.name?.trim() || fallback
}

function getOrCreateSet(map: Map<string, Set<string>>, key: string) {
    let values = map.get(key)
    if (!values) {
        values = new Set<string>()
        map.set(key, values)
    }
    return values
}
