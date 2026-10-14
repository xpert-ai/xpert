import { CommandBus } from '@nestjs/cqrs'
import { tool } from '@langchain/core/tools'
import { ToolMessage } from '@langchain/core/messages'
import { z } from 'zod/v3'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { AssistantTemplateSetup, IXpert } from '@xpert-ai/contracts'
import { createTemplateRuntimeMiddleware } from './template-runtime.middleware'

type Request = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
const request = (name: string): Request => ({
    toolCall: { id: 'call-1', name, args: {}, type: 'tool_call' },
    tool: tool(async () => 'ok', { name, description: 'Test', schema: z.object({}) }),
    state: { messages: [] },
    runtime: {}
})

describe('template runtime readiness gate', () => {
    let setup: AssistantTemplateSetup
    let middleware: AgentMiddleware
    const handler = jest.fn().mockResolvedValue('executed')
    beforeEach(() => {
        handler.mockClear()
        setup = {
            assistantId: 'assistant',
            state: { revision: 0, preferences: {}, connectors: {} },
            connectors: [
                {
                    key: 'calendar',
                    provider: 'calendar',
                    required: true,
                    purpose: 'Read',
                    permissions: [],
                    status: 'requires_auth',
                    options: []
                }
            ],
            routines: []
        }
        const commands = { execute: jest.fn(async () => setup) } as unknown as CommandBus
        middleware = createTemplateRuntimeMiddleware(
            {
                id: 'assistant',
                options: {
                    templateDefinition: {
                        schemaVersion: 2,
                        manifest: {
                            schemaVersion: 2,
                            version: '1',
                            connectors: [
                                {
                                    key: 'calendar',
                                    provider: 'calendar',
                                    required: true,
                                    purpose: 'Read',
                                    permissions: []
                                }
                            ]
                        }
                    }
                }
            } as IXpert,
            commands
        )
    })
    it('blocks actual execution until the required connection is ready', async () => {
        const response = await middleware.wrapToolCall(request('read_calendar'), handler)
        expect(response).toBeInstanceOf(ToolMessage)
        expect(response).toMatchObject({ status: 'error' })
        expect(handler).not.toHaveBeenCalled()
        setup.connectors[0].status = 'ready'
        await middleware.wrapToolCall(request('read_calendar'), handler)
        expect(handler).toHaveBeenCalledTimes(1)
        setup.connectors[0].status = 'expired'
        await middleware.wrapToolCall(request('read_calendar'), handler)
        expect(handler).toHaveBeenCalledTimes(1)
    })
    it('allows local tools when an optional connection is skipped', async () => {
        setup.connectors[0].required = false
        setup.connectors[0].status = 'skipped'
        expect(await middleware.wrapToolCall(request('sandbox_read_file'), handler)).toBe('executed')
    })
    it('keeps preference saving available while connections are incomplete', async () => {
        expect(await middleware.wrapToolCall(request('save_assistant_preferences'), handler)).toBe('executed')
    })
})
