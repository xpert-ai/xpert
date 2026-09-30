import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE, RequestContext } from '@xpert-ai/plugin-sdk'
import {
    LanguagesEnum,
    RolesEnum,
    STATE_VARIABLE_HUMAN,
    WorkflowNodeTypeEnum,
    XpertTypeEnum,
    type IWFNTrigger,
    type IXpert,
    type NodeOf,
    type TXpertGraph
} from '@xpert-ai/contracts'
import { XpertEnqueueTriggerDispatchCommand } from '../enqueue-trigger-dispatch.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'
import { XpertPublishTriggersHandler } from './publish-triggers.handler'
import { runWithCapturedRequestContext } from '../../../shared/request-context'

describe('XpertPublishTriggersHandler', () => {
    it('adds automation instructions to run input without changing the assistant or incoming state', async () => {
        const { handler, triggerRegistry, commandBus } = createHandler()
        let callback: (payload: unknown) => Promise<void>
        triggerRegistry.get.mockReturnValue({
            publish: jest.fn((_params, next) => {
                callback = next
            }),
            stop: jest.fn()
        })
        const trigger = triggerNode('schedule', { enabled: true, cron: '0 8 * * *', task: 'Briefing' }, 0)
        ;(trigger.entity as IWFNTrigger).config.additionalInstructions = 'Focus on blockers'
        const graph: TXpertGraph = { nodes: [trigger], connections: [] }
        await handler.execute(new XpertPublishTriggersCommand({ id: 'assistant', graph } as IXpert, { strict: true }))
        const state = { [STATE_VARIABLE_HUMAN]: { input: 'Briefing', context: 'keep' }, other: 'unchanged' }
        await callback({ state })
        expect(commandBus.execute.mock.calls[0][0].state).toEqual({
            [STATE_VARIABLE_HUMAN]: { input: 'Briefing\n\nFocus on blockers', context: 'keep' },
            other: 'unchanged'
        })
        expect(state[STATE_VARIABLE_HUMAN].input).toBe('Briefing')
        expect(graph.nodes[0].entity).not.toHaveProperty('prompt')
        expect(triggerRegistry.get().publish).toHaveBeenCalledWith(
            { xpertId: 'assistant', config: { enabled: true, cron: '0 8 * * *', task: 'Briefing' } },
            expect.any(Function)
        )
    })

    it('refreshes the runtime callback when only additional instructions change', async () => {
        const { handler, triggerRegistry } = createHandler()
        const strategy = { publish: jest.fn(), stop: jest.fn() }
        triggerRegistry.get.mockReturnValue(strategy)
        const previous = graphWith({ from: 'schedule', config: { enabled: true } })
        const next = structuredClone(previous)
        ;(next.nodes[0].entity as IWFNTrigger).config.additionalInstructions = 'New context'
        await handler.execute(
            new XpertPublishTriggersCommand({ id: 'assistant', graph: next } as IXpert, {
                previousGraph: previous,
                strict: true
            })
        )
        expect(strategy.stop).toHaveBeenCalledTimes(1)
        expect(strategy.publish).toHaveBeenCalledTimes(1)
    })
    it('preserves handoff identity, callbacks and attachments when adding automatic-run instructions', async () => {
        const { handler, triggerRegistry, handoffQueue } = createHandler()
        let callback: (payload: unknown) => Promise<void>
        triggerRegistry.get.mockReturnValue({
            publish: jest.fn((_params, next) => {
                callback = next
            }),
            stop: jest.fn()
        })
        const trigger = triggerNode('event', { enabled: true }, 0)
        ;(trigger.entity as IWFNTrigger).config.additionalInstructions = 'Summarize blockers'
        await handler.execute(
            new XpertPublishTriggersCommand(
                { id: 'assistant', graph: { nodes: [trigger], connections: [] } } as IXpert,
                { strict: true }
            )
        )
        const message = {
            id: 'event-1',
            type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
            payload: {
                request: {
                    action: 'send',
                    message: { input: { input: 'Issue assigned', files: ['attachment'] } },
                    state: { context: 'keep' }
                },
                options: { xpertId: 'assistant' },
                callback: { messageType: 'reply' }
            }
        }
        await callback({ handoffMessage: message })
        expect(handoffQueue.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'event-1',
                payload: expect.objectContaining({
                    request: expect.objectContaining({
                        message: { input: { input: 'Issue assigned\n\nSummarize blockers', files: ['attachment'] } },
                        state: expect.objectContaining({ context: 'keep' })
                    }),
                    options: message.payload.options,
                    callback: message.payload.callback
                })
            })
        )
        expect(message.payload.request.message.input.input).toBe('Issue assigned')
    })

    function runWithTriggerContext<T>(callback: () => Promise<T>): Promise<T> {
        return runWithCapturedRequestContext(
            {
                headers: { ['organization-id']: 'org-1' },
                user: {
                    id: 'user-1',
                    tenantId: 'tenant-1',
                    preferredLanguage: LanguagesEnum.English,
                    role: {
                        name: RolesEnum.ADMIN
                    }
                }
            },
            callback
        )
    }

    function createHandler() {
        const triggerRegistry = { get: jest.fn() }
        const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
        const handoffQueue = { enqueue: jest.fn().mockResolvedValue({ id: 'handoff-id' }) }

        const handler = new XpertPublishTriggersHandler(triggerRegistry as any, commandBus as any, handoffQueue as any)

        return {
            handler,
            triggerRegistry,
            commandBus,
            handoffQueue
        }
    }

    function triggerNode(from: string, config: Record<string, unknown>, index: number): NodeOf<'workflow'> {
        const key = `Trigger_${index + 1}`
        const entity: IWFNTrigger = {
            id: key,
            key,
            type: WorkflowNodeTypeEnum.TRIGGER,
            from,
            config
        }

        return {
            key,
            type: 'workflow',
            position: {
                x: 0,
                y: index * 120
            },
            entity
        }
    }

    function graphWith(...triggers: Array<{ from: string; config: Record<string, unknown> }>): TXpertGraph {
        return {
            nodes: triggers.map((trigger, index) => triggerNode(trigger.from, trigger.config, index)),
            connections: []
        }
    }

    it('runs delayed trigger callback in the captured publish request context', async () => {
        const { handler, triggerRegistry, commandBus } = createHandler()
        let publishedCallback: ((payload: unknown) => Promise<void> | void) | undefined
        commandBus.execute.mockImplementation(async () => {
            expect(RequestContext.currentTenantId()).toBe('tenant-1')
            expect(RequestContext.getOrganizationId()).toBe('org-1')
            expect(RequestContext.currentUserId()).toBe('user-1')
        })
        triggerRegistry.get.mockReturnValue({
            publish: jest.fn((_params, callback) => {
                publishedCallback = callback
            }),
            stop: jest.fn()
        })

        await runWithTriggerContext(() =>
            handler.execute(
                new XpertPublishTriggersCommand(
                    {
                        id: 'xpert-1',
                        tenantId: 'tenant-1',
                        organizationId: 'org-1',
                        slug: 'xpert-1',
                        name: 'Xpert',
                        type: XpertTypeEnum.Agent,
                        graph: graphWith({
                            from: 'schedule',
                            config: { enabled: true, cron: '* * * * *', task: 'tick' }
                        })
                    },
                    {
                        strict: true
                    }
                )
            )
        )

        await Promise.resolve(
            publishedCallback?.({
                state: {
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'trigger callback'
                    }
                }
            })
        )
    })

    it('publish callback enqueues dispatch with workflow trigger source', async () => {
        const { handler, triggerRegistry, commandBus } = createHandler()
        triggerRegistry.get.mockReturnValue({
            publish: jest.fn((_params, callback) => {
                callback({
                    from: 'job',
                    state: {
                        [STATE_VARIABLE_HUMAN]: {
                            input: 'trigger callback'
                        }
                    }
                })
            }),
            stop: jest.fn()
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: {
                        nodes: [
                            {
                                type: 'workflow',
                                entity: {
                                    type: 'trigger',
                                    from: 'schedule',
                                    config: { enabled: true, cron: '* * * * *', task: 'tick' }
                                }
                            }
                        ]
                    }
                } as any,
                {
                    strict: true
                }
            )
        )
        await new Promise((resolve) => setImmediate(resolve))

        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        const [command] = commandBus.execute.mock.calls[0]
        expect(command).toBeInstanceOf(XpertEnqueueTriggerDispatchCommand)
        expect(command).toEqual(
            expect.objectContaining({
                xpertId: 'xpert-1',
                userId: null,
                state: expect.objectContaining({
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'trigger callback'
                    }
                }),
                params: expect.objectContaining({
                    isDraft: false,
                    from: 'schedule'
                })
            })
        )
    })

    it('publish callback enqueues handoffMessage directly', async () => {
        const { handler, triggerRegistry, handoffQueue } = createHandler()
        triggerRegistry.get.mockReturnValue({
            publish: jest.fn((_params, callback) => {
                callback({
                    handoffMessage: {
                        id: 'handoff-1',
                        type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE
                    }
                })
            }),
            stop: jest.fn()
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: {
                        nodes: [
                            {
                                type: 'workflow',
                                entity: {
                                    type: 'trigger',
                                    from: 'lark',
                                    config: { enabled: true, integrationId: 'integration-1' }
                                }
                            }
                        ]
                    }
                } as any,
                {
                    strict: true
                }
            )
        )
        await new Promise((resolve) => setImmediate(resolve))

        expect(handoffQueue.enqueue).toHaveBeenCalledTimes(1)
        expect(handoffQueue.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'handoff-1',
                type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE
            })
        )
    })

    it('publish callback propagates async handoff enqueue failures', async () => {
        const { handler, triggerRegistry, handoffQueue } = createHandler()
        let publishedCallback: ((payload: any) => Promise<void> | void) | undefined
        triggerRegistry.get.mockReturnValue({
            publish: jest.fn((_params, callback) => {
                publishedCallback = callback
            }),
            stop: jest.fn()
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: {
                        nodes: [
                            {
                                type: 'workflow',
                                entity: {
                                    type: 'trigger',
                                    from: 'wechat',
                                    config: { enabled: true, integrationId: 'integration-1' }
                                }
                            }
                        ]
                    }
                } as any,
                {
                    strict: true
                }
            )
        )

        handoffQueue.enqueue.mockRejectedValueOnce(new Error('queue down'))
        await expect(
            Promise.resolve(
                publishedCallback?.({
                    handoffMessage: {
                        id: 'handoff-1',
                        type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE
                    }
                })
            )
        ).rejects.toThrow('queue down')
    })

    it('throws when strict=true and provider.publish fails', async () => {
        const { handler, triggerRegistry } = createHandler()
        triggerRegistry.get.mockReturnValue({
            publish: jest.fn(() => {
                throw new Error('conflict')
            }),
            stop: jest.fn()
        })

        await expect(
            handler.execute(
                new XpertPublishTriggersCommand(
                    {
                        id: 'xpert-1',
                        graph: {
                            nodes: [
                                {
                                    type: 'workflow',
                                    entity: {
                                        type: 'trigger',
                                        from: 'lark',
                                        config: { enabled: true, integrationId: 'integration-1' }
                                    }
                                }
                            ]
                        }
                    } as any,
                    {
                        strict: true
                    }
                )
            )
        ).rejects.toThrow('conflict')
    })

    it('skips errors when strict=false', async () => {
        const { handler, triggerRegistry } = createHandler()
        triggerRegistry.get.mockImplementation(() => {
            throw new Error('provider-not-found')
        })

        await expect(
            handler.execute(
                new XpertPublishTriggersCommand(
                    {
                        id: 'xpert-1',
                        graph: {
                            nodes: [
                                {
                                    type: 'workflow',
                                    entity: {
                                        type: 'trigger',
                                        from: 'lark',
                                        config: { enabled: true, integrationId: 'integration-1' }
                                    }
                                }
                            ]
                        }
                    } as any,
                    {
                        strict: false
                    }
                )
            )
        ).resolves.toBeUndefined()
    })

    it('publishes only selected providers when options.providers is set', async () => {
        const { handler, triggerRegistry } = createHandler()
        const schedulePublish = jest.fn()
        const larkPublish = jest.fn()
        triggerRegistry.get.mockImplementation((provider: string) => {
            if (provider === 'schedule') {
                return {
                    publish: schedulePublish,
                    stop: jest.fn()
                }
            }
            if (provider === 'lark') {
                return {
                    publish: larkPublish,
                    stop: jest.fn()
                }
            }
            throw new Error(`Unexpected provider ${provider}`)
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: {
                        nodes: [
                            {
                                type: 'workflow',
                                entity: {
                                    type: 'trigger',
                                    from: 'schedule',
                                    config: { enabled: true, cron: '* * * * *', task: 'tick' }
                                }
                            },
                            {
                                type: 'workflow',
                                entity: {
                                    type: 'trigger',
                                    from: 'lark',
                                    config: { enabled: true, integrationId: 'integration-1' }
                                }
                            }
                        ]
                    }
                } as any,
                {
                    strict: true,
                    providers: ['schedule']
                }
            )
        )

        expect(schedulePublish).toHaveBeenCalledTimes(1)
        expect(larkPublish).not.toHaveBeenCalled()
        expect(triggerRegistry.get).toHaveBeenCalledTimes(1)
        expect(triggerRegistry.get).toHaveBeenCalledWith('schedule')
    })

    it('stops only selected providers from previousGraph when options.providers is set', async () => {
        const { handler, triggerRegistry } = createHandler()
        const scheduleStop = jest.fn()
        const larkStop = jest.fn()
        triggerRegistry.get.mockImplementation((provider: string) => {
            if (provider === 'schedule') {
                return {
                    publish: jest.fn(),
                    stop: scheduleStop
                }
            }
            if (provider === 'lark') {
                return {
                    publish: jest.fn(),
                    stop: larkStop
                }
            }
            throw new Error(`Unexpected provider ${provider}`)
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: {
                        nodes: []
                    }
                } as any,
                {
                    strict: true,
                    providers: ['schedule'],
                    previousGraph: {
                        nodes: [
                            {
                                type: 'workflow',
                                entity: {
                                    type: 'trigger',
                                    from: 'schedule',
                                    config: { enabled: true, cron: '* * * * *', task: 'tick' }
                                }
                            },
                            {
                                type: 'workflow',
                                entity: {
                                    type: 'trigger',
                                    from: 'lark',
                                    config: { enabled: true, integrationId: 'integration-1' }
                                }
                            }
                        ],
                        connections: []
                    } as any
                }
            )
        )

        expect(scheduleStop).toHaveBeenCalledTimes(1)
        expect(larkStop).not.toHaveBeenCalled()
        expect(triggerRegistry.get).toHaveBeenCalledTimes(1)
        expect(triggerRegistry.get).toHaveBeenCalledWith('schedule')
    })

    it('skips unchanged trigger when previousGraph has equivalent config', async () => {
        const { handler, triggerRegistry } = createHandler()
        const publish = jest.fn()
        const stop = jest.fn()
        triggerRegistry.get.mockReturnValue({
            publish,
            stop
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: graphWith({
                        from: 'schedule',
                        config: { b: 2, a: 1 }
                    })
                } as any,
                {
                    strict: true,
                    previousGraph: graphWith({
                        from: 'schedule',
                        config: { a: 1, b: 2 }
                    }) as any
                }
            )
        )

        expect(stop).not.toHaveBeenCalled()
        expect(publish).not.toHaveBeenCalled()
        expect(triggerRegistry.get).not.toHaveBeenCalled()
    })

    it('publishes added trigger only', async () => {
        const { handler, triggerRegistry } = createHandler()
        const publish = jest.fn()
        const stop = jest.fn()
        triggerRegistry.get.mockReturnValue({
            publish,
            stop
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: graphWith({
                        from: 'schedule',
                        config: { cron: '* * * * *', task: 'tick' }
                    })
                } as any,
                {
                    strict: true,
                    previousGraph: graphWith() as any
                }
            )
        )

        expect(publish).toHaveBeenCalledTimes(1)
        expect(stop).not.toHaveBeenCalled()
    })

    it('stops removed trigger only', async () => {
        const { handler, triggerRegistry } = createHandler()
        const publish = jest.fn()
        const stop = jest.fn()
        triggerRegistry.get.mockReturnValue({
            publish,
            stop
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: graphWith()
                } as any,
                {
                    strict: true,
                    previousGraph: graphWith({
                        from: 'schedule',
                        config: { cron: '* * * * *', task: 'tick' }
                    }) as any
                }
            )
        )

        expect(stop).toHaveBeenCalledTimes(1)
        expect(publish).not.toHaveBeenCalled()
    })

    it('reconciles changed trigger with stop then publish', async () => {
        const { handler, triggerRegistry } = createHandler()
        const calls: string[] = []
        const stop = jest.fn(({ config }) => {
            calls.push(`stop:${(config as any).version}`)
        })
        const publish = jest.fn(({ config }) => {
            calls.push(`publish:${(config as any).version}`)
        })
        triggerRegistry.get.mockReturnValue({
            publish,
            stop
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: graphWith({
                        from: 'schedule',
                        config: { version: 2 }
                    })
                } as any,
                {
                    strict: true,
                    previousGraph: graphWith({
                        from: 'schedule',
                        config: { version: 1 }
                    }) as any
                }
            )
        )

        expect(calls).toEqual(['stop:1', 'publish:2'])
    })

    it('attempts rollback and throws original error when changed publish fails in strict mode', async () => {
        const { handler, triggerRegistry } = createHandler()
        const stop = jest.fn()
        const publish = jest.fn(({ config }) => {
            if ((config as any).version === 2) {
                throw new Error('changed-publish-failed')
            }
        })
        triggerRegistry.get.mockReturnValue({
            publish,
            stop
        })

        await expect(
            handler.execute(
                new XpertPublishTriggersCommand(
                    {
                        id: 'xpert-1',
                        graph: graphWith({
                            from: 'schedule',
                            config: { version: 2 }
                        })
                    } as any,
                    {
                        strict: true,
                        previousGraph: graphWith({
                            from: 'schedule',
                            config: { version: 1 }
                        }) as any
                    }
                )
            )
        ).rejects.toThrow('changed-publish-failed')

        expect(stop).toHaveBeenCalledTimes(1)
        expect(publish).toHaveBeenCalledTimes(2)
        expect(publish.mock.calls[0]?.[0]).toEqual(
            expect.objectContaining({
                config: expect.objectContaining({ version: 2 })
            })
        )
        expect(publish.mock.calls[1]?.[0]).toEqual(
            expect.objectContaining({
                config: expect.objectContaining({ version: 1 })
            })
        )
    })

    it('attempts rollback and continues when changed publish fails in non-strict mode', async () => {
        const { handler, triggerRegistry } = createHandler()
        const stop = jest.fn()
        const publish = jest.fn(({ config }) => {
            if ((config as any).version === 2) {
                throw new Error('changed-publish-failed')
            }
        })
        triggerRegistry.get.mockReturnValue({
            publish,
            stop
        })

        await expect(
            handler.execute(
                new XpertPublishTriggersCommand(
                    {
                        id: 'xpert-1',
                        graph: graphWith({
                            from: 'schedule',
                            config: { version: 2 }
                        })
                    } as any,
                    {
                        strict: false,
                        previousGraph: graphWith({
                            from: 'schedule',
                            config: { version: 1 }
                        }) as any
                    }
                )
            )
        ).resolves.toBeUndefined()

        expect(stop).toHaveBeenCalledTimes(1)
        expect(publish).toHaveBeenCalledTimes(2)
    })

    it('applies provider filter to delta reconciliation', async () => {
        const { handler, triggerRegistry } = createHandler()
        const scheduleStop = jest.fn()
        const schedulePublish = jest.fn()
        const larkStop = jest.fn()
        const larkPublish = jest.fn()
        triggerRegistry.get.mockImplementation((provider: string) => {
            if (provider === 'schedule') {
                return {
                    publish: schedulePublish,
                    stop: scheduleStop
                }
            }
            if (provider === 'lark') {
                return {
                    publish: larkPublish,
                    stop: larkStop
                }
            }
            throw new Error(`Unexpected provider ${provider}`)
        })

        await handler.execute(
            new XpertPublishTriggersCommand(
                {
                    id: 'xpert-1',
                    graph: graphWith(
                        {
                            from: 'schedule',
                            config: { version: 2 }
                        },
                        {
                            from: 'lark',
                            config: { version: 2 }
                        }
                    )
                } as any,
                {
                    strict: true,
                    providers: ['schedule'],
                    previousGraph: graphWith(
                        {
                            from: 'schedule',
                            config: { version: 1 }
                        },
                        {
                            from: 'lark',
                            config: { version: 1 }
                        }
                    ) as any
                }
            )
        )

        expect(scheduleStop).toHaveBeenCalledTimes(1)
        expect(schedulePublish).toHaveBeenCalledTimes(1)
        expect(larkStop).not.toHaveBeenCalled()
        expect(larkPublish).not.toHaveBeenCalled()
        expect(triggerRegistry.get).toHaveBeenCalledTimes(1)
        expect(triggerRegistry.get).toHaveBeenCalledWith('schedule')
    })
})
