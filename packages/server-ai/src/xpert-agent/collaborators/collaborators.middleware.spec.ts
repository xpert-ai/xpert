jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { IXpert, IXpertAgent, TXpertGraph, XpertParameterTypeEnum } from '@xpert-ai/contracts'
import z from 'zod'
import { emptyRuntimeResources } from '../../agent-plugin/runtime-resource.service'
import {
    createCollaboratorsMiddleware,
    resolveCollaborators,
    collaboratorToolDeclaration
} from './collaborators.middleware'

function expert(id: string): IXpert {
    return {
        id,
        slug: `expert_${id}`,
        description: `Delegate to ${id}`,
        agent: { key: `agent_${id}`, parameters: [] }
    } as IXpert
}

function fixture() {
    const configured = expert('configured')
    const required = expert('required')
    const dynamic = expert('dynamic')
    const agent = { key: 'leader', collaborators: [configured, required] } as IXpertAgent
    const graph: TXpertGraph = {
        nodes: [],
        connections: [
            { key: 'configured', type: 'xpert', from: agent.key, to: `${configured.id}/entry` },
            { key: 'required', type: 'xpert', from: agent.key, to: required.id, required: true }
        ]
    }
    return { configured, required, dynamic, agent, graph, isStart: true }
}

describe('CollaboratorsMiddleware', () => {
    it('exposes compiled invocations as ordinary middleware tools', async () => {
        const compile = jest.fn(async (experts: IXpert[]) => experts.map(collaboratorToolDeclaration))
        const middleware = await createCollaboratorsMiddleware(fixture(), compile)
        expect(middleware.tools).toHaveLength(2)
        expect(Reflect.ownKeys(middleware)).toEqual(['name', 'tools'])
    })
    it('preserves configured collaborators and their tool declarations', () => {
        const options = fixture()
        const experts = resolveCollaborators(options)
        const tools = experts.map(collaboratorToolDeclaration)
        expect(experts.map((target) => target.id)).toEqual(['configured', 'required'])
        expect(tools).toHaveLength(2)
        expect(tools[0]).toMatchObject({
            name: 'expert_configured',
            description: 'Delegate to configured'
        })
    })

    it('retains required graph connections when the legacy allowlist is empty', () => {
        const options = fixture()
        const experts = resolveCollaborators({
            ...options,
            runtimeCapabilities: {
                mode: 'allowlist',
                skills: { ids: [] },
                plugins: { nodeKeys: [] },
                subAgents: { nodeKeys: [] }
            }
        })
        expect(experts.map((target) => target.id)).toEqual(['required'])
    })

    it('normalizes selected graph target keys and merges dynamic resources without changing the graph', () => {
        const options = fixture()
        const before = JSON.stringify({ graph: options.graph, agent: options.agent })
        const experts = resolveCollaborators({
            ...options,
            runtimeCapabilities: {
                mode: 'allowlist',
                skills: { ids: [] },
                plugins: { nodeKeys: [] },
                subAgents: { nodeKeys: ['configured/entry'] }
            },
            runtimeResources: {
                ...emptyRuntimeResources(),
                experts: [options.dynamic, options.configured, options.dynamic]
            }
        })
        expect(experts.map((target) => target.id)).toEqual(['configured', 'required', 'dynamic'])
        expect(JSON.stringify({ graph: options.graph, agent: options.agent })).toBe(before)
    })

    it.each([{ isStart: true, leaderKey: 'parent' }, { isStart: false }])(
        'does not pass conversation resources to child agents: %j',
        (entry) => {
            const options = fixture()
            const experts = resolveCollaborators({
                ...options,
                ...entry,
                runtimeResources: { ...emptyRuntimeResources(), experts: [options.dynamic] }
            })
            expect(experts.map((target) => target.id)).toEqual(['configured', 'required'])
        }
    )

    it('keeps expert parameter precedence and refuses direct execution outside the host graph', async () => {
        const options = fixture()
        options.configured.agentConfig = {
            parameters: [{ name: 'caseId', type: XpertParameterTypeEnum.STRING }]
        }
        options.configured.agent.parameters = [{ name: 'ignored', type: XpertParameterTypeEnum.NUMBER }]
        const declaration = collaboratorToolDeclaration(resolveCollaborators(options)[0])
        const schema = declaration.schema
        expect(schema).toBeInstanceOf(z.ZodObject)
        if (!(schema instanceof z.ZodObject)) throw new Error('Expected an expert parameter schema')
        expect(schema.safeParse({ input: 'Review', caseId: 'case-1' }).success).toBe(true)
        expect(schema.safeParse({ input: 'Review' }).success).toBe(false)
        await expect(declaration.invoke({ input: 'Review', caseId: 'case-1' })).rejects.toThrow()
    })
})
