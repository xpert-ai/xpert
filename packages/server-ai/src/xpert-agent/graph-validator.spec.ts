import {
    IXpertAgent,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { AGENT_SUBGRAPH_BUILD_CYCLE, XpertAgentGraphValidator } from './graph-validator'

describe('XpertAgentGraphValidator', () => {
    const validator = new XpertAgentGraphValidator()

    it('reports a cycle when a parent and child agent share an entry workflow branch', () => {
        const draft = createDraft(
            ['main', 'child'],
            [
                createEdge('shared/output', 'main'),
                createEdge('shared/output', 'child'),
                createAgentConnection('main', 'child')
            ],
            [createWorkflowNode('shared')]
        )

        expect(validator.handle({ draft })).toEqual([
            expect.objectContaining({
                ruleCode: AGENT_SUBGRAPH_BUILD_CYCLE,
                level: 'error',
                field: 'connections',
                value: 'Child → Main → Child'
            })
        ])
    })

    it('allows a shared workflow fan-out when there is no recursive agent dependency', () => {
        const draft = createDraft(
            ['main', 'child'],
            [createEdge('shared/output', 'main'), createEdge('shared/output', 'child')],
            [createWorkflowNode('shared')]
        )

        expect(validator.handle({ draft })).toEqual([])
    })

    it('allows a one-way sub-agent connection without a shared entry path', () => {
        const draft = createDraft(['main', 'child'], [createAgentConnection('main', 'child')])

        expect(validator.handle({ draft })).toEqual([])
    })

    it('reports a multi-level mixed build cycle', () => {
        const draft = createDraft(
            ['main', 'reviewer', 'runner'],
            [
                createAgentConnection('main', 'reviewer'),
                createAgentConnection('reviewer', 'runner'),
                createEdge('shared', 'main'),
                createEdge('shared', 'runner')
            ],
            [createWorkflowNode('shared')]
        )

        const results = validator.handle({ draft })

        expect(results).toHaveLength(1)
        expect(results[0]).toEqual(
            expect.objectContaining({
                ruleCode: AGENT_SUBGRAPH_BUILD_CYCLE,
                value: 'Reviewer → Runner → Main → Reviewer'
            })
        )
    })

    it('allows the primary agent swarm handled by the dedicated swarm compiler', () => {
        const draft = createDraft(
            ['main', 'partner'],
            [createAgentConnection('main', 'partner'), createAgentConnection('partner', 'main')]
        )

        expect(validator.handle({ draft })).toEqual([])
    })

    it('reports a nested agent cycle that is not the primary swarm', () => {
        const draft = createDraft(
            ['main', 'agent-a', 'agent-b'],
            [
                createAgentConnection('main', 'agent-a'),
                createAgentConnection('agent-a', 'agent-b'),
                createAgentConnection('agent-b', 'agent-a')
            ]
        )

        const results = validator.handle({ draft })

        expect(results).toHaveLength(1)
        expect(results[0].ruleCode).toBe(AGENT_SUBGRAPH_BUILD_CYCLE)
    })

    it('reports a cycle that re-enters an agent through an iterator child graph', () => {
        const draft = createDraft(
            ['main', 'inner', 'child'],
            [
                createAgentConnection('main', 'child'),
                createAgentConnection('inner', 'child'),
                createEdge('iterator/start', 'inner'),
                createEdge('iterator', 'child')
            ],
            [createWorkflowNode('iterator', WorkflowNodeTypeEnum.ITERATOR)],
            { inner: 'iterator' }
        )

        expect(validator.handle({ draft })).toEqual([
            expect.objectContaining({
                ruleCode: AGENT_SUBGRAPH_BUILD_CYCLE,
                value: 'Child → Inner → Child'
            })
        ])
    })

    it('allows an iterator child graph when its internal agent does not reconnect to the entry agent', () => {
        const draft = createDraft(
            ['main', 'inner', 'child'],
            [
                createAgentConnection('main', 'child'),
                createEdge('iterator/start', 'inner'),
                createEdge('iterator', 'child')
            ],
            [createWorkflowNode('iterator', WorkflowNodeTypeEnum.ITERATOR)],
            { inner: 'iterator' }
        )

        expect(validator.handle({ draft })).toEqual([])
    })

    it('reports a cycle that re-enters an agent through a subflow target', () => {
        const draft = createDraft(
            ['main', 'child'],
            [
                createAgentConnection('main', 'child'),
                createAgentConnection('subflow', 'main'),
                createEdge('subflow', 'child')
            ],
            [createWorkflowNode('subflow', WorkflowNodeTypeEnum.SUBFLOW)]
        )

        expect(validator.handle({ draft })).toEqual([
            expect.objectContaining({
                ruleCode: AGENT_SUBGRAPH_BUILD_CYCLE,
                value: 'Main → Child → Main'
            })
        ])
    })

    it('allows a subflow target that does not reconnect to the entry agent', () => {
        const draft = createDraft(
            ['main', 'helper', 'child'],
            [
                createAgentConnection('main', 'child'),
                createAgentConnection('subflow', 'helper'),
                createEdge('subflow', 'child')
            ],
            [createWorkflowNode('subflow', WorkflowNodeTypeEnum.SUBFLOW)]
        )

        expect(validator.handle({ draft })).toEqual([])
    })

    function createDraft(
        agentKeys: string[],
        connections: TXpertTeamConnection[],
        workflowNodes: TXpertTeamNode<'workflow'>[] = [],
        agentParentIds: Record<string, string> = {}
    ): TXpertTeamDraft {
        const agents = agentKeys.map((key) => createAgentNode(key, agentParentIds[key]))
        return {
            team: {
                agent: agents[0].entity
            },
            nodes: [...agents, ...workflowNodes],
            connections
        }
    }

    function createAgentNode(key: string, parentId?: string): TXpertTeamNode<'agent'> {
        const title = key
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
        const entity: IXpertAgent = {
            key,
            name: title,
            title
        }
        return {
            type: 'agent',
            key,
            parentId,
            position: { x: 0, y: 0 },
            entity
        }
    }

    function createWorkflowNode(
        key: string,
        type: WorkflowNodeTypeEnum = WorkflowNodeTypeEnum.TEMPLATE
    ): TXpertTeamNode<'workflow'> {
        return {
            type: 'workflow',
            key,
            position: { x: 0, y: 0 },
            entity: {
                id: key,
                key,
                type
            }
        }
    }

    function createEdge(from: string, to: string): TXpertTeamConnection {
        return {
            type: 'edge',
            key: `${from}/${to}`,
            from,
            to
        }
    }

    function createAgentConnection(from: string, to: string): TXpertTeamConnection {
        return {
            type: 'agent',
            key: `${from}/${to}`,
            from,
            to
        }
    }
})
