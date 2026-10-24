import { IXpert, TXpertGraph, XpertTypeEnum, XpertParameterTypeEnum } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { legacyThreadGraphRevision, threadGraphRevision, threadGraphRevisionMatches } from './thread-graph-revision'

function graph(): TXpertGraph {
    return {
        nodes: [
            {
                key: 'first',
                type: 'agent',
                position: { x: 0, y: 0 },
                entity: {
                    key: 'first',
                    prompt: 'Execute the approved task',
                    description: 'Used in delegation',
                    copilotModel: { model: 'model-a', options: { temperature: 0.2 } }
                }
            },
            {
                key: 'next',
                type: 'agent',
                position: { x: 300, y: 0 },
                entity: { key: 'next', prompt: 'Report the result' }
            }
        ],
        connections: [{ key: 'edge', from: 'first', to: 'next', type: 'edge' }]
    }
}

it.each(['position', 'size', 'hash', 'updatedAt'] as const)(
    'ignores only typed presentation/publication field %s',
    (field) => {
        const original = graph()
        const edited = structuredClone(original)
        const node = edited.nodes[0]
        if (field === 'position') node.position = { x: 200, y: 300 }
        if (field === 'size') node.size = { width: 400, height: 300 }
        if (field === 'hash') node.hash = 'editor-cache'
        if (field === 'updatedAt' && node.type === 'agent') node.entity = { ...node.entity, updatedAt: new Date() }
        expect(threadGraphRevision(original)).toMatch(/^execution-v2:[a-f0-9]{64}$/)
        expect(threadGraphRevision(edited)).toBe(threadGraphRevision(original))
        expect(edited).not.toEqual(original)
    }
)

it('normalizes nested collaborator layout without mutating the stored graph', () => {
    const original: TXpertGraph = {
        nodes: [
            {
                key: 'team',
                type: 'xpert',
                position: { x: 0, y: 0 },
                expanded: true,
                entity: { slug: 'nested', name: 'Nested', type: XpertTypeEnum.Agent },
                nodes: graph().nodes,
                connections: graph().connections
            }
        ],
        connections: []
    }
    const edited = structuredClone(original)
    const node = edited.nodes[0]
    if (node.type !== 'xpert') throw new Error('Expected collaborator fixture')
    node.expanded = false
    node.nodes[0].position.x = 500
    const before = structuredClone(edited)
    expect(threadGraphRevision(edited)).toBe(threadGraphRevision(original))
    expect(edited).toEqual(before)
    node.connections = []
    expect(threadGraphRevision(edited)).not.toBe(threadGraphRevision(original))
})

it.each([
    'prompt',
    'model',
    'options',
    'description',
    'node-key',
    'edge',
    'edge-option',
    'node-order',
    'nested-position'
] as const)('retains execution-relevant changes: %s', (field) => {
    const original = graph()
    const edited = structuredClone(original)
    const node = edited.nodes[0]
    if (node.type !== 'agent') throw new Error('Expected agent fixture')
    if (field === 'prompt') node.entity.prompt = 'Different task'
    if (field === 'model') node.entity.copilotModel.model = 'model-b'
    if (field === 'options') node.entity.copilotModel.options.temperature = 1
    if (field === 'description') node.entity.description = 'Different delegation instructions'
    if (field === 'node-key') node.key = 'replacement'
    if (field === 'edge') edited.connections = []
    if (field === 'edge-option') edited.connections[0].required = false
    if (field === 'node-order') edited.nodes.reverse()
    // An option called "position" is not a canvas field and must never be stripped recursively.
    if (field === 'nested-position') node.entity.copilotModel.options.position = 'execution-option'
    expect(threadGraphRevision(edited)).not.toBe(threadGraphRevision(original))
})

it('canonicalizes object key order while retaining array order', () => {
    const original = graph()
    const reordered = {
        connections: original.connections,
        nodes: original.nodes.map((node) => ({ entity: node.entity, ...node }))
    }
    expect(threadGraphRevision(reordered)).toBe(threadGraphRevision(original))
})

it('ignores Assistant canvas settings and publication bookkeeping', () => {
    const team: Partial<IXpert> = {
        agent: { key: 'first' },
        copilotModel: { model: 'inherited' },
        options: { position: { x: 0, y: 0 }, agent: { first: { position: { x: 0, y: 0 } } } }
    }
    const saved = threadGraphRevision(graph(), undefined, team)
    team.options.position.x = 400
    team.options.scale = 2
    team.options.agent.first.position.x = 500
    team.options.workflow = { workflow: { size: { width: 500, height: 200 } } }
    team.options.pendingPublication = { version: 'new', previousGraph: graph() }
    team.version = 'new'
    team.publishAt = new Date()
    expect(threadGraphRevision(graph(), undefined, team)).toBe(saved)
})

it.each(['inherited-model', 'state-schema', 'tools', 'primary-agent', 'environment'] as const)(
    'rejects Assistant-level execution changes: %s',
    (field) => {
        const team: Partial<IXpert> = { agent: { key: 'first' }, copilotModel: { model: 'inherited' }, agentConfig: {} }
        const saved = threadGraphRevision(graph(), undefined, team)
        if (field === 'inherited-model') team.copilotModel.model = 'different-model'
        if (field === 'state-schema')
            team.agentConfig.parameters = [{ name: 'required-value', type: XpertParameterTypeEnum.STRING }]
        if (field === 'tools') team.agentConfig.tools = { operation: { timeout: 1000 } }
        if (field === 'primary-agent') team.agent.key = 'next'
        if (field === 'environment') team.environmentId = 'different-environment'
        expect(threadGraphRevision(graph(), undefined, team)).not.toBe(saved)
    }
)

it('supports legacy hashes only when the entire graph still matches exactly', () => {
    const original = graph()
    const legacy = createHash('sha256').update(JSON.stringify(original)).digest('hex')
    expect(legacyThreadGraphRevision(original)).toBe(legacy)
    expect(threadGraphRevision(original, legacy)).toBe(legacy)
    expect(threadGraphRevisionMatches(legacy, threadGraphRevision(original), legacyThreadGraphRevision(original))).toBe(
        true
    )
    original.nodes[0].position.x = 900
    expect(threadGraphRevision(original, legacy)).not.toBe(legacy)
    expect(threadGraphRevisionMatches(legacy, threadGraphRevision(original), legacyThreadGraphRevision(original))).toBe(
        false
    )
})

it.each([undefined, '', 'unknown', `execution-v3:${'a'.repeat(64)}`])('rejects an unverified revision %s', (saved) => {
    const current = graph()
    expect(threadGraphRevisionMatches(saved, threadGraphRevision(current), legacyThreadGraphRevision(current))).toBe(
        false
    )
})
