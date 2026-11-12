jest.mock('../sandbox/sandbox.service', () => ({ SandboxService: class {} }))

import { AIMessage, SystemMessage } from '@langchain/core/messages'
import { Test } from '@nestjs/testing'
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter'
import Ajv from 'ajv'
import { LanguagesEnum, type IXpertAgent } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, type IAgentMiddlewareContext, type ModelRequest } from '@xpert-ai/plugin-sdk'
import { createAgentMiddlewareEntries, getRuntimeEnabledMiddlewareNodes } from '../shared/agent/middleware'
import { FakeStreamingChatModel } from '../shared/agent/fake-streaming-chat-model'
import type { TXpertAgentRuntimeOptions } from '../shared/agent/state'
import { REQUEST_USER_INPUT_MIDDLEWARE_NAME, REQUEST_USER_INPUT_SCHEMA } from '../shared/agent/user-input'
import { RequestUserInputCapabilityProvider } from '../xpert-template/capabilities/builtin-capabilities'
import { blankAssistantTemplate } from '../xpert-template/capabilities/blank-assistant-template'
import { primaryAgent } from '../xpert-template/capabilities/capability-state'
import { parseCapabilityTemplateDraft } from '../xpert-template/capabilities/template-draft'
import { ClientToolMiddleware } from './client-tool.middleware'
import { RequestUserInputMiddleware } from './request-user-input.middleware'
import { EventNameXpertValidate } from '../xpert/types'

function fixture() {
    const template = blankAssistantTemplate([])
    const draft = parseCapabilityTemplateDraft(template.export_data)
    const provider = new RequestUserInputCapabilityProvider()
    const clientTools = new ClientToolMiddleware()
    const strategy = new RequestUserInputMiddleware(clientTools)
    const get = jest.fn((name: string) => {
        if (name !== REQUEST_USER_INPUT_MIDDLEWARE_NAME) throw new Error(`Unexpected provider: ${name}`)
        return strategy
    })
    const registry = { get } as unknown as AgentMiddlewareRegistry
    const context: Omit<IAgentMiddlewareContext, 'node'> = {
        tenantId: 'tenant',
        userId: 'user',
        tools: new Map(),
        runtime: { createModelClient: jest.fn(), wrapWorkflowNodeExecution: jest.fn() }
    }
    const capabilityContext = {
        draft,
        template,
        language: LanguagesEnum.English,
        loadTemplate: async () => {
            throw new Error('No template dependencies')
        }
    }
    const apply = () => provider.apply(capabilityContext)
    const load = async (agent = primaryAgent(draft).entity, options: TXpertAgentRuntimeOptions = {}) => {
        const nodes = getRuntimeEnabledMiddlewareNodes(draft, agent, options)
        const entries = await createAgentMiddlewareEntries(
            nodes,
            registry,
            { ...context, agentKey: agent.key },
            options
        )
        return entries.map(({ middleware }) => middleware)
    }
    return { draft, provider, clientTools, strategy, get, apply, load, capabilityContext }
}

describe('RequestUserInputMiddleware capability', () => {
    it('resolves its client-tool dependency through Nest injection', async () => {
        const module = await Test.createTestingModule({
            providers: [ClientToolMiddleware, RequestUserInputMiddleware]
        }).compile()
        expect(module.get(RequestUserInputMiddleware).getToolNames()).toEqual(['request_user_input'])
        await module.close()
    })

    it('registers the tool only for the primary Agent after explicit capability selection', async () => {
        const f = fixture()
        const originalFeatures = structuredClone(f.draft.team.features)
        const child: IXpertAgent = { ...primaryAgent(f.draft).entity, key: 'child', name: 'child' }
        f.draft.nodes.push({ type: 'agent', key: child.key, position: { x: 0, y: 100 }, entity: child })
        expect(f.provider.isEnabled(f.draft)).toBe(false)
        expect(await f.provider.check(f.capabilityContext)).toMatchObject({ available: true })
        expect(await f.load()).toEqual([])
        expect(await f.load(undefined, { planMode: true })).toEqual([])
        expect(f.get).not.toHaveBeenCalled()

        await f.apply()
        const composed = structuredClone(f.draft)
        await f.apply()
        expect(f.draft).toEqual(composed)
        expect(f.provider.isEnabled(f.draft)).toBe(true)
        expect(f.draft.team.features).toEqual(originalFeatures)
        const [middleware] = await f.load()
        expect(middleware.tools?.map(({ name }) => name)).toEqual(['request_user_input'])
        expect(middleware.tools?.[0].metadata?.middlewareIcon).toEqual(f.strategy.meta.icon)
        expect(await f.load(child)).toEqual([])
    })

    it('registers the same tool schema and provider for every invocation', async () => {
        const f = fixture()
        await f.apply()
        const draft = structuredClone(f.draft)
        const create = jest.spyOn(f.clientTools, 'createMiddleware')
        await f.load()
        await f.load(undefined, { planMode: true })
        expect(create.mock.calls[0][0].clientTools[0].schema).toBe(JSON.stringify(REQUEST_USER_INPUT_SCHEMA))
        expect(create.mock.calls[1][0]).toEqual(create.mock.calls[0][0])
        for (const [, context] of create.mock.calls) {
            expect(context.node.provider).toBe(REQUEST_USER_INPUT_MIDDLEWARE_NAME)
            expect(context).not.toHaveProperty('planMode')
            expect(context).not.toHaveProperty('agentOptions')
        }
        expect(f.draft).toEqual(draft)
    })

    it.each<NonNullable<IXpertAgent['options']>>([
        { hidden: true },
        { structuredOutputMethod: 'jsonMode' },
        { structuredOutputMethod: 'functionCalling' }
    ])('rejects unsupported Agent options at capability composition and publication: %j', async (agentOptions) => {
        const f = fixture()
        const agent = primaryAgent(f.draft).entity
        agent.options = agentOptions
        expect(await f.provider.check(f.capabilityContext)).toMatchObject({ available: false })
        await expect(f.apply()).rejects.toThrow()
        expect(f.provider.isEnabled(f.draft)).toBe(false)
        agent.options = {}
        await f.apply()
        agent.options = agentOptions
        expect(() => f.provider.validateDraft({ draft: f.draft })).toThrow()
    })

    it('rejects connecting the question capability to a child at publication', async () => {
        const f = fixture()
        await f.apply()
        const agent = primaryAgent(f.draft).entity
        const [questionNode] = getRuntimeEnabledMiddlewareNodes(f.draft, agent)
        f.draft.nodes.push({
            type: 'agent',
            key: 'child',
            position: { x: 0, y: 100 },
            entity: { ...agent, key: 'child' }
        })
        f.draft.connections.push({ key: 'child/input', type: 'workflow', from: 'child', to: questionNode.key })
        expect(() => f.provider.validateDraft({ draft: f.draft })).toThrow()
    })

    it('propagates capability validation failures through the publication event', async () => {
        const module = await Test.createTestingModule({
            imports: [EventEmitterModule.forRoot()],
            providers: [RequestUserInputCapabilityProvider]
        }).compile()
        await module.init()
        try {
            const f = fixture()
            await f.apply()
            const events = module.get(EventEmitter2)
            await expect(events.emitAsync(EventNameXpertValidate, { draft: f.draft })).resolves.toEqual([[]])
            primaryAgent(f.draft).entity.options.hidden = true
            await expect(events.emitAsync(EventNameXpertValidate, { draft: f.draft })).rejects.toThrow()
        } finally {
            await module.close()
        }
    })

    it('describes mutually exclusive form and question arguments in the registered schema', () => {
        const validate = new Ajv({ strict: false }).compile(REQUEST_USER_INPUT_SCHEMA)
        const form = {
            schemaVersion: 1,
            mode: 'blocking',
            purpose: 'clarification',
            title: 'Scope',
            fields: [{ id: 'scope', type: 'text', label: 'Scope' }]
        }
        const plan = {
            questions: [
                {
                    id: 'scope',
                    header: 'Scope',
                    question: 'Scope?',
                    options: [
                        { label: 'A', description: 'A' },
                        { label: 'B', description: 'B' }
                    ]
                }
            ]
        }
        expect(validate(form)).toBe(true)
        expect(validate(plan)).toBe(true)
        expect(validate({ ...form, ...plan })).toBe(false)
        expect(validate({})).toBe(false)
        expect(validate({ ...form, mode: 'non_blocking' })).toBe(false)
    })

    it.each([false, true])(
        'respects per-tool disabling without adding question prompts (Plan Mode: %s)',
        async (planMode) => {
            const f = fixture()
            await f.apply()
            const node = f.draft.nodes.find((node) => node.type === 'workflow')
            if (!node || node.type !== 'workflow') throw new Error('Missing middleware node')
            const [middleware] = await f.load(undefined, {
                planMode,
                toolPreferences: {
                    version: 1,
                    middlewares: {
                        [node.key]: {
                            provider: REQUEST_USER_INPUT_MIDDLEWARE_NAME,
                            disabledTools: ['request_user_input']
                        }
                    }
                }
            })
            expect(middleware.tools).toEqual([])
            const handler = jest.fn(async (request: ModelRequest) => {
                expect(request.systemMessage?.content).not.toContain('schemaVersion 1')
                expect(request.systemMessage?.content).not.toContain('implement_plan')
                if (planMode) expect(request.systemMessage?.content).toContain('End the turn after the plan.')
                return new AIMessage('done')
            })
            const request: ModelRequest = {
                model: new FakeStreamingChatModel({}),
                messages: [],
                tools: middleware.tools,
                systemMessage: new SystemMessage('base'),
                state: { messages: [], human: { planMode } },
                runtime: {}
            }
            await middleware.wrapModelCall!(request, handler)
            expect(handler).toHaveBeenCalledTimes(1)
        }
    )
})
