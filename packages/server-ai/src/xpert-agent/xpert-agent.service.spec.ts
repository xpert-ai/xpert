import { of } from 'rxjs'
import { FindXpertQuery } from '../xpert/queries/get-one.query'
import { XpertAgentChatCommand } from './commands/chat.command'
import { XpertAgentService } from './xpert-agent.service'

describe('XpertAgentService', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let service: XpertAgentService

    beforeEach(() => {
        commandBus = {
            execute: jest.fn().mockResolvedValue(of({ data: { ok: true } } as MessageEvent))
        }
        queryBus = {
            execute: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                agent: {
                    key: 'agent-1'
                }
            })
        }

        service = new XpertAgentService({} as any, commandBus as any, queryBus as any)
    })

    it('maps run requests to a new agent chat command', async () => {
        await service.chatAgent(
            {
                action: 'run',
                agentKey: 'agent-1',
                xpertId: 'xpert-1',
                state: {
                    human: {
                        input: 'Hello'
                    }
                }
            },
            {
                language: 'en-US'
            } as any
        )

        const query = queryBus.execute.mock.calls[0][0] as FindXpertQuery
        expect(query).toBeInstanceOf(FindXpertQuery)
        expect(query.conditions).toEqual({ id: 'xpert-1' })
        expect(query.params).toEqual({ relations: ['agent'], isDraft: true })
        expect(commandBus.execute).toHaveBeenCalledTimes(1)

        const command = commandBus.execute.mock.calls[0][0] as XpertAgentChatCommand
        expect(command).toBeInstanceOf(XpertAgentChatCommand)
        expect(command.state).toEqual({
            human: {
                input: 'Hello'
            }
        })
        expect(command.agentKey).toBe('agent-1')
        expect(command.options.execution).toBeUndefined()
        expect(command.options.resume).toBeUndefined()
    })

    it('maps resume requests to resume an existing execution', async () => {
        await service.chatAgent(
            {
                action: 'resume',
                agentKey: 'agent-1',
                xpertId: 'xpert-1',
                target: {
                    executionId: 'execution-1'
                },
                decision: {
                    type: 'confirm',
                    payload: {
                        approved: true
                    }
                },
                patch: {
                    agentKey: 'agent-2'
                },
                state: {
                    human: {
                        input: 'Continue'
                    }
                }
            },
            {} as any
        )

        const command = commandBus.execute.mock.calls[0][0] as XpertAgentChatCommand
        expect(command.options.execution).toEqual({
            id: 'execution-1',
            category: 'agent'
        })
        expect(command.options.resume).toEqual({
            decision: {
                type: 'confirm',
                payload: {
                    approved: true
                }
            },
            patch: {
                agentKey: 'agent-2'
            }
        })
    })

    it('rejects legacy agent payloads', async () => {
        await expect(
            service.chatAgent(
                {
                    agentKey: 'agent-1',
                    xpertId: 'xpert-1',
                    executionId: 'execution-1',
                    reject: true,
                    state: {
                        human: {
                            input: 'Reject this'
                        }
                    }
                } as any,
                {} as any
            )
        ).rejects.toThrow('Invalid agent chat request action')
    })
})
