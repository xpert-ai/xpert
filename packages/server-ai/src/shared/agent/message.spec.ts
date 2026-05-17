import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { createHumanMessage } from './message'
import { ResolvePromptWorkflowInvocationQuery } from './queries/resolve-prompt-workflow-invocation.query'

describe('createHumanMessage', () => {
    it('expands raw prompt workflow invocations before creating the agent human message', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue({
                input: {
                    input: 'Review this: src/app.ts'
                }
            })
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                human: {
                    input: '/review src/app.ts',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: { workspaceId: 'workspace-1', ids: [] },
                        plugins: { nodeKeys: [] },
                        subAgents: { nodeKeys: [] }
                    }
                }
            },
            undefined,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                }
            }
        )

        expect(message.content).toBe('Review this: src/app.ts')
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ResolvePromptWorkflowInvocationQuery))
    })

    it('does not resolve prompt workflows for normal input even when xpert context is available', async () => {
        const queryBus = {
            execute: jest.fn()
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as any,
            queryBus as any,
            {
                human: {
                    input: 'Please review src/app.ts'
                }
            },
            undefined,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                }
            }
        )

        expect(message.content).toBe('Please review src/app.ts')
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('attempts to resolve builtin-named slash invocations so middleware commands can own them', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue(null)
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                human: {
                    input: '/goal Migrate the app'
                }
            },
            undefined,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                }
            }
        )

        expect(message.content).toBe('/goal Migrate the app')
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ResolvePromptWorkflowInvocationQuery))
    })

    it('turns image references into image_url content parts and preserves text fallback', async () => {
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn()
        }

        const message = await createHumanMessage(
            commandBus as any,
            queryBus as any,
            {
                human: {
                    input: 'Please analyze this image',
                    references: [
                        {
                            type: 'image',
                            url: 'https://example.com/image.png',
                            name: 'diagram.png',
                            mimeType: 'image/png',
                            text: 'Pasted image: diagram.png'
                        }
                    ]
                }
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'image_url',
                image_url: {
                    url: 'https://example.com/image.png'
                }
            },
            {
                type: 'text',
                text: expect.stringContaining('Please analyze this image')
            }
        ])
        expect((message.content as Array<{ type: string; text?: string }>)[1].text).toContain('[Image] diagram.png')
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('still creates multimodal content when the human input only contains image references', async () => {
        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as any,
            {
                execute: jest.fn()
            } as any,
            {
                human: {
                    input: '',
                    references: [
                        {
                            type: 'image',
                            url: 'https://example.com/reference-only.png',
                            name: 'reference-only.png',
                            text: 'Pasted image: reference-only.png'
                        }
                    ]
                }
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'image_url',
                image_url: {
                    url: 'https://example.com/reference-only.png'
                }
            },
            {
                type: 'text',
                text: expect.stringContaining('[Image] reference-only.png')
            }
        ])
    })
})
