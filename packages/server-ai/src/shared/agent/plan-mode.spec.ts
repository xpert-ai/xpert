import { SystemMessage } from '@langchain/core/messages'
import {
    createPlanModeMiddlewareEntries,
    hasExplicitPlanModeFlag,
    isPlanModeEnabledFromState,
    PLAN_MODE_REQUEST_USER_INPUT_SCHEMA
} from './plan-mode'

describe('plan mode middleware helpers', () => {
    it('detects plan mode from human state', () => {
        expect(
            isPlanModeEnabledFromState({
                human: {
                    input: 'Plan this',
                    planMode: true
                }
            })
        ).toBe(true)
        expect(hasExplicitPlanModeFlag({ human: { planMode: false } })).toBe(true)
        expect(isPlanModeEnabledFromState({ human: { planMode: false } })).toBe(false)
        expect(hasExplicitPlanModeFlag({ human: { input: 'Plan this' } })).toBe(false)
    })

    it('creates request_user_input client tool and prompt middleware only when enabled', async () => {
        const clientToolMiddleware = {
            name: 'ClientToolMiddleware',
            tools: [{ name: 'request_user_input' }]
        }
        const createMiddleware = jest.fn().mockResolvedValue(clientToolMiddleware)
        const registry = {
            get: jest.fn().mockReturnValue({
                createMiddleware
            })
        }
        const context = {
            tenantId: 'tenant-1',
            userId: 'user-1',
            tools: new Map(),
            runtime: {}
        }

        await expect(createPlanModeMiddlewareEntries(registry as any, context as any, false)).resolves.toEqual([])

        const entries = await createPlanModeMiddlewareEntries(registry as any, context as any, true)

        expect(registry.get).toHaveBeenCalledWith('ClientToolMiddleware')
        expect(createMiddleware).toHaveBeenCalledWith(
            expect.objectContaining({
                clientTools: [
                    expect.objectContaining({
                        name: 'request_user_input',
                        description: expect.stringContaining('Use once for clarification before a plan'),
                        schema: PLAN_MODE_REQUEST_USER_INPUT_SCHEMA
                    })
                ]
            }),
            expect.objectContaining({
                node: expect.objectContaining({
                    provider: 'ClientToolMiddleware'
                })
            })
        )
        expect(JSON.parse(PLAN_MODE_REQUEST_USER_INPUT_SCHEMA)).toMatchObject({
            properties: {
                questions: {
                    minItems: 1,
                    maxItems: 3
                }
            }
        })

        const promptEntry = entries.find((entry) => entry.key === '__xpert_plan_mode_prompt__')
        expect(promptEntry).toBeDefined()
        const handler = jest.fn().mockResolvedValue('ok')
        await promptEntry!.middleware.wrapModelCall!(
            {
                systemMessage: new SystemMessage('base')
            } as any,
            handler
        )

        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({
                systemMessage: expect.objectContaining({
                    content: expect.stringContaining('<proposed_plan>')
                })
            })
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('write the plan directly as Markdown')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'Do not wrap the proposed plan in a fenced code block.'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('strict state machine')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('at most once before proposing the plan')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'make conservative assumptions in the proposed plan instead of asking another clarification round'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('content.purpose "plan_clarification"')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('They are never approval to implement.')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'do not call request_user_input for more clarification'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'same assistant response has already presented the proposed plan'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'content.purpose "implementation_confirmation"'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).not.toContain('```markdown')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('Implement this plan?')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('Yes, implement this plan')
    })
})
