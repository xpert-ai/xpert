// Invariants: omit typed presentation fields and publication timestamps; retain execution settings and array order.
// Legacy hashes require the exact original JSON. Never upgrade an unverifiable recovery boundary.
import type { IXpert, TXpertGraph, TXpertTeamNode } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'

const legacyRevision = /^[a-f0-9]{64}$/

export function legacyThreadGraphRevision(graph: TXpertGraph): string {
    return createHash('sha256').update(JSON.stringify(graph)).digest('hex')
}

export function threadGraphRevision(graph: TXpertGraph, savedRevision?: string, team?: Partial<IXpert>): string {
    if (savedRevision && legacyRevision.test(savedRevision)) return legacyThreadGraphRevision(graph)
    const definition = {
        ...graph,
        nodes: graph.nodes.map(executionNode),
        execution: team ? executionSettings(team) : undefined
    }
    const serialized = JSON.stringify(definition, (_key, value: unknown) => {
        // Database JSON objects can reorder keys; arrays and all property values retain their meaning.
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.fromEntries(
                Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            )
        }
        return value
    })
    return `execution-v2:${createHash('sha256').update(serialized).digest('hex')}`
}

function executionSettings(team: Partial<IXpert>): object {
    const {
        position: _position,
        scale: _scale,
        agent: _agent,
        knowledge: _knowledge,
        toolset: _toolset,
        workflow: _workflow,
        xpert: _xpert,
        pendingPublication: _pending,
        ...options
    } = team.options ?? {}
    const model = team.copilotModel
    return {
        type: team.type,
        primaryAgentKey: team.agent?.key,
        copilotModel: model
            ? { copilotId: model.copilotId, modelType: model.modelType, model: model.model, options: model.options }
            : null,
        agentConfig: team.agentConfig ?? null,
        memory: team.memory ?? null,
        summarize: team.summarize ?? null,
        features: team.features ?? null,
        commandProfile: team.commandProfile ?? null,
        options,
        environmentId: team.environmentId ?? null,
        workspaceId: team.workspaceId ?? null,
        workspaceDataScope: team.workspaceDataScope ?? 'shared'
    }
}

export function threadGraphRevisionMatches(saved: string | undefined, current: string, legacy?: string): boolean {
    return !!saved && (saved === current || (legacyRevision.test(saved) && saved === legacy))
}

function executionNode(node: TXpertTeamNode): object {
    const { position: _position, size: _size, hash: _hash, ...execution } = node
    if (node.type === 'agent') {
        // Publication saves the agent even for a canvas edit; updatedAt is persistence metadata.
        const { updatedAt: _updatedAt, ...entity } = node.entity
        return { ...execution, entity }
    }
    if (node.type === 'xpert') {
        const { position: _position, size: _size, hash: _hash, expanded: _expanded, ...collaborator } = node
        return { ...collaborator, ...(node.nodes ? { nodes: node.nodes.map(executionNode) } : {}) }
    }
    return execution
}
