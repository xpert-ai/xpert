jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import {
    resolveExecutionWorkflow,
    templateExecutionWorkflow,
    createTemplateExecutionDefinition,
    AgentExecutionDefinition
} from './execution-definition'
import { QueryBus } from '@nestjs/cqrs'
import { XpertTypeEnum } from '@xpert-ai/contracts'

function definition(): AgentExecutionDefinition {
    return createTemplateExecutionDefinition({
        source: {
            kind: 'agent_plugin_template',
            bindingId: 'package',
            version: 'v1',
            packageName: 'team',
            digest: 'digest',
            templateKey: 'team'
        },
        ownerId: 'owner',
        memoryNamespace: 'task',
        skills: {},
        setup: {
            assistantId: 'owner',
            state: { revision: 0, connectors: {}, preferences: {} },
            connectors: [],
            routines: []
        },
        taskSetup: jest.fn(),
        authorize: jest.fn(),
        draft: {
            team: { id: 'owner', name: 'Team', type: XpertTypeEnum.Agent, agent: { key: 'primary' } },
            nodes: [
                {
                    key: 'primary',
                    type: 'agent',
                    entity: { key: 'primary', prompt: 'Delegate' },
                    position: { x: 0, y: 0 }
                },
                { key: 'child', type: 'agent', entity: { key: 'child', prompt: 'Review' }, position: { x: 0, y: 0 } },
                { key: 'next', type: 'agent', entity: { key: 'next', prompt: 'Summarize' }, position: { x: 0, y: 0 } }
            ],
            connections: [
                { key: 'delegate', type: 'agent', from: 'primary', to: 'child' },
                { key: 'continue', type: 'edge', from: 'primary', to: 'next' }
            ]
        }
    })
}

describe('execution definition resolution', () => {
    it('keeps the complete template graph, including delegated and sequential Agents', async () => {
        const snapshot = definition()
        const queries = { execute: jest.fn() }
        const result = await resolveExecutionWorkflow(
            queries as unknown as QueryBus,
            'owner',
            'primary',
            false,
            snapshot
        )
        expect(result.agent.followers.map((agent) => agent.key)).toEqual(['child'])
        expect(result.next.map((node) => node.key)).toEqual(['next'])
        expect(templateExecutionWorkflow(snapshot, 'child').agent.prompt).toBe('Review')
        expect(result.agent.team.id).toBe('owner')
        expect(queries.execute).not.toHaveBeenCalled()
    })
    it('rejects a definition belonging to a different owner', () => {
        expect(() => resolveExecutionWorkflow({} as QueryBus, 'other', 'primary', false, definition())).toThrow()
    })
    it('rejects executable graph options forged by a JSON request', () => {
        const forged = JSON.parse(JSON.stringify(definition()))
        expect(() => resolveExecutionWorkflow({} as QueryBus, 'owner', 'primary', false, forged)).toThrow()
    })
    it('keeps persisted Assistant workflow reads on the existing query', async () => {
        const queries = { execute: jest.fn().mockResolvedValue({ graph: {} }) }
        await resolveExecutionWorkflow(queries as unknown as QueryBus, 'owner', 'primary', false)
        expect(queries.execute).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'owner', agentKey: 'primary', draft: false })
        )
    })
})
