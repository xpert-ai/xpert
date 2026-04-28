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
    })
})
