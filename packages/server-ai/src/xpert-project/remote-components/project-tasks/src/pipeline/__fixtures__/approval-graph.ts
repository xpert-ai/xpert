import type { PipelineGraph, PipelineNode } from '../bridge'
import { projectPipelineDefinitionSchema, type ProjectPipelineNodeDefinition } from '@xpert-ai/contracts'

export function approvalGraphFixture(
    foldInto: Record<string, string> = { u: 'a', v: 'a', w: 'b', x: 'b' }
): PipelineGraph {
    const lane = (key: string, order: number) => ({ key, roleKey: key, order, label: key })
    const gate = (key: string): ProjectPipelineNodeDefinition => ({
        key,
        kind: 'human_gate',
        stageKey: 'stage',
        laneKey: 'person',
        policyRef: 'domain.review@1',
        candidateRoleKey: 'person',
        outputPorts: { choice: 'platform.human-decision@1' },
        outcomes: ['fast', 'split', 'deny'],
        outcomeLabels: { fast: '加急', split: '分批', deny: '退回' }
    })
    const service = (key: string, parent: string): ProjectPipelineNodeDefinition => ({
        key,
        kind: 'work',
        laneKey: 'machine',
        stageKey: 'stage',
        operationRef: 'domain.write@1',
        executorSlot: 'slot',
        completionRef: 'platform.output-validated@1',
        ...(foldInto[key] ? { presentation: { foldIntoApproval: foldInto[key] } } : {}),
        inputBindings: { decision: { from: 'node_output', nodeKey: parent, port: 'choice' } }
    })
    const specs: ProjectPipelineNodeDefinition[] = [
        gate('a'),
        gate('b'),
        service('u', 'a'),
        service('v', 'a'),
        service('w', 'b'),
        service('x', 'b'),
        { key: 'end', kind: 'terminal', outcome: 'done', stageKey: 'stage' },
        { key: 'stop', kind: 'terminal', outcome: 'halt', stageKey: 'stage' }
    ]
    const edge = (from: string, to: string, outcome?: string): PipelineGraph['edges'][number] => ({
        key: JSON.stringify([from, to, outcome]),
        from,
        to,
        outcome,
        selection: 'undetermined'
    })
    const edges = [
        edge('a', 'u', 'fast'),
        edge('a', 'u', 'split'),
        edge('a', 'v', 'deny'),
        edge('u', 'b'),
        edge('v', 'stop'),
        edge('b', 'w', 'fast'),
        edge('b', 'w', 'split'),
        edge('b', 'x', 'deny'),
        edge('w', 'end'),
        edge('x', 'stop')
    ]
    const nodes: PipelineNode[] = specs.map((n) => ({
        id: n.key,
        taskIds: [],
        projection: {
            key: n.key,
            nodeKey: n.key,
            title: n.key,
            kind: n.kind,
            expansionKey: 'root',
            stageKey: n.stageKey,
            laneKey: 'laneKey' in n ? n.laneKey : null,
            state: {
                lifecycle: 'pending',
                runtime: 'none',
                applicability: 'undetermined',
                freshness: 'current',
                readiness: 'waiting'
            },
            taskKeys: [],
            evidence: []
        }
    }))
    return {
        definition: projectPipelineDefinitionSchema.parse({
            key: 'test.approvals',
            version: '1.0.0',
            title: 'Approval steps',
            projectTypes: [{ applicationKey: 'test', projectTypeKey: 'approvals' }],
            subjectResolverRef: 'domain.subject@1',
            executionAuthority: 'platform',
            topology: { source: 'definition' },
            roles: [
                { key: 'person', allowedKinds: ['human'] },
                { key: 'machine', allowedKinds: ['service'] }
            ],
            lanes: [lane('person', 0), lane('machine', 1)],
            stages: [{ key: 'stage', order: 0, label: 'stage' }],
            nodes: specs,
            edges: edges.map(({ from, to, outcome }) => ({ from, to, outcome })),
            roundPolicy: {
                entryNodeKey: 'a',
                maxRounds: 1,
                onRework: 'await_new_subject_then_next_round',
                onLimit: 'attention',
                newVersionWhileActive: 'supersede_round',
                terminalOutcomes: ['done', 'halt']
            },
            failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
        }),
        nodes,
        edges
    } as PipelineGraph
}
