jest.mock('../../../environment', () => {
    const actual = jest.requireActual('../../../environment/utils')

    return {
        EnvironmentService: class EnvironmentService {},
        getContextEnvState: actual.getContextEnvState,
        mergeEnvironmentWithEnvState: actual.mergeEnvironmentWithEnvState
    }
})

jest.mock('../../stream/redis-sse.service', () => ({
    RedisSseStreamService: class RedisSseStreamService {}
}))

jest.mock('../../../xpert', () => ({
    PublishedXpertAccessService: class PublishedXpertAccessService {}
}))

jest.mock('@metad/contracts', () => {
    const actual = jest.requireActual('@metad/contracts')

    return {
        ...actual,
        RequestScopeLevel: {
            TENANT: 'tenant',
            ORGANIZATION: 'organization'
        }
    }
})

jest.mock('@metad/server-core', () => ({
    RequestContext: {
        currentApiKey: jest.fn(),
        currentRequest: jest.fn(),
        currentUser: jest.fn()
    }
}))

import { of } from 'rxjs'
import { RequestContext } from '@metad/server-core'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { RunCreateStreamHandler, validateRunCreateInput } from './run-create-stream.handler'

const conversation = {
    id: 'conversation-1'
} as any

describe('validateRunCreateInput', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('accepts send payloads', () => {
        const result = validateRunCreateInput(
            {
                action: 'send',
                message: {
                    input: { input: 'Hi' }
                },
                state: {
                    human: {
                        input: 'Hi'
                    }
                }
            },
            conversation
        )

        expect(result).toMatchObject({
            action: 'send',
            message: {
                input: { input: 'Hi' }
            },
            state: {
                human: {
                    input: 'Hi'
                }
            }
        })
    })

    it('accepts resume payloads', () => {
        const result = validateRunCreateInput(
            {
                action: 'resume',
                conversationId: 'conversation-1',
                target: {
                    aiMessageId: 'message-1',
                    executionId: 'execution-1'
                },
                decision: {
                    type: 'confirm'
                }
            },
            conversation
        )

        expect(result).toEqual({
            action: 'resume',
            conversationId: 'conversation-1',
            target: {
                aiMessageId: 'message-1',
                executionId: 'execution-1'
            },
            decision: {
                type: 'confirm'
            }
        })
    })

    it('accepts legacy send payloads and normalizes them to v2', () => {
        const result = validateRunCreateInput(
            {
                id: 'client-message-1',
                conversationId: 'conversation-1',
                projectId: 'project-1',
                environmentId: 'environment-1',
                sandboxEnvironmentId: 'sandbox-1',
                input: { input: 'Tell me a joke.' },
                state: {
                    human: {
                        input: 'Tell me a joke.'
                    }
                }
            },
            conversation
        )

        expect(result).toEqual({
            action: 'send',
            conversationId: 'conversation-1',
            projectId: 'project-1',
            environmentId: 'environment-1',
            sandboxEnvironmentId: 'sandbox-1',
            message: {
                clientMessageId: 'client-message-1',
                input: { input: 'Tell me a joke.' }
            },
            state: {
                human: {
                    input: 'Tell me a joke.'
                }
            }
        })
    })

    it('accepts legacy resume payloads and normalizes them to v2', () => {
        const result = validateRunCreateInput(
            {
                conversationId: 'conversation-1',
                id: 'message-1',
                executionId: 'execution-1',
                confirm: true,
                command: {
                    resume: {
                        approved: true
                    },
                    toolCalls: [{ id: 'call-1', args: { name: 'updated' } }],
                    update: {
                        status: 'patched'
                    },
                    agentKey: 'agent-1'
                },
                state: {
                    human: {
                        input: 'Continue'
                    }
                }
            },
            conversation
        )

        expect(result).toEqual({
            action: 'resume',
            conversationId: 'conversation-1',
            target: {
                aiMessageId: 'message-1',
                executionId: 'execution-1'
            },
            decision: {
                type: 'confirm',
                payload: {
                    approved: true
                }
            },
            patch: {
                agentKey: 'agent-1',
                toolCalls: [{ id: 'call-1', args: { name: 'updated' } }],
                update: {
                    status: 'patched'
                }
            },
            state: {
                human: {
                    input: 'Continue'
                }
            }
        })
    })

    it('accepts legacy retry payloads and normalizes them to v2', () => {
        const result = validateRunCreateInput(
            {
                conversationId: 'conversation-1',
                id: 'message-1',
                executionId: 'execution-1',
                retry: true,
                environmentId: 'environment-1',
                sandboxEnvironmentId: 'sandbox-1',
                input: { input: 'Retry this' }
            },
            conversation
        )

        expect(result).toEqual({
            action: 'retry',
            conversationId: 'conversation-1',
            source: {
                aiMessageId: 'message-1',
                executionId: 'execution-1'
            },
            environmentId: 'environment-1',
            sandboxEnvironmentId: 'sandbox-1'
        })
    })

    it('rejects missing input', () => {
        expect(() => validateRunCreateInput({}, conversation)).toThrow()
    })
})

describe('RunCreateStreamHandler environment resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('merges run context env into the resolved environment', async () => {
        const environmentService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'environment-1',
                name: 'Default Environment',
                workspaceId: 'workspace-from-environment',
                variables: [
                    {
                        name: 'region',
                        value: 'us',
                        type: 'default'
                    }
                ]
            })
        }
        const handler = new RunCreateStreamHandler(
            {} as any,
            {} as any,
            environmentService as any,
            {} as any,
            {} as any
        )

        const result = await handler['resolveRequestEnvironment'](
            { environmentId: 'environment-1' },
            {
                action: 'send',
                conversationId: 'conversation-1',
                environmentId: 'environment-1',
                message: {
                    input: {
                        input: 'Create an assistant'
                    }
                }
            } as any,
            {
                env: {
                    workspaceId: 'workspace-from-request'
                }
            } as any
        )

        expect(environmentService.findOne).toHaveBeenCalledWith('environment-1')
        expect(result).toEqual(
            expect.objectContaining({
                workspaceId: 'workspace-from-environment',
                variables: expect.arrayContaining([
                    expect.objectContaining({
                        name: 'workspaceId',
                        value: 'workspace-from-request'
                    })
                ])
            })
        )
    })
})

describe('RunCreateStreamHandler execute', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('forwards the full runCreate.context and merged environment to Xpert chat', async () => {
        ;(RequestContext.currentApiKey as jest.Mock).mockReturnValue(null)
        const commandBus = {
            execute: jest.fn(async (command) => {
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    return {
                        id: 'execution-1'
                    }
                }

                if (command instanceof XpertChatCommand) {
                    return of({
                        data: {
                            data: null
                        }
                    } as any)
                }

                return null
            })
        }
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'GetChatConversationQuery') {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        xpertId: 'xpert-1',
                        options: {}
                    }
                }

                return {
                    id: 'xpert-1'
                }
            })
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                environmentId: null
            })
        }

        const handler = new RunCreateStreamHandler(
            commandBus as any,
            queryBus as any,
            {
                findOne: jest.fn().mockResolvedValue(undefined)
            } as any,
            {
                appendEvent: jest.fn().mockResolvedValue(undefined),
                appendCompleteEvent: jest.fn().mockResolvedValue(undefined)
            } as any,
            publishedXpertAccessService as any
        )

        await handler.execute({
            threadId: 'thread-1',
            runCreate: {
                assistant_id: 'xpert-1',
                input: {
                    action: 'send',
                    message: {
                        input: {
                            input: 'Create assistant'
                        }
                    }
                },
                context: {
                    scope: 'workspace',
                    target: {
                        type: 'assistant'
                    },
                    env: {
                        workspaceId: 'workspace-1',
                        region: 'cn'
                    }
                }
            }
        } as any)

        const xpertChatCommand = commandBus.execute.mock.calls.find(
            ([command]) => command instanceof XpertChatCommand
        )?.[0]

        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1', {
            relations: ['user', 'createdBy']
        })
        expect(xpertChatCommand).toBeInstanceOf(XpertChatCommand)
        expect(xpertChatCommand.options).toMatchObject({
            context: {
                scope: 'workspace',
                target: {
                    type: 'assistant'
                },
                env: {
                    workspaceId: 'workspace-1',
                    region: 'cn'
                }
            },
            environment: {
                name: 'Request Environment',
                variables: expect.arrayContaining([
                    expect.objectContaining({
                        name: 'workspaceId',
                        value: 'workspace-1'
                    }),
                    expect.objectContaining({
                        name: 'region',
                        value: 'cn'
                    })
                ])
            }
        })
    })

    it('resolves assistant api keys in tenant scope and promotes the assistant principal', async () => {
        const request = {
            headers: {
                'organization-id': 'org-created-by-owner'
            },
            user: {
                id: 'owner-user-1',
                tenantId: 'tenant-1',
                ownerUserId: 'owner-user-1',
                principalType: 'api_key'
            }
        }
        ;(RequestContext.currentApiKey as jest.Mock).mockReturnValue({
            id: 'key-1',
            tenantId: 'tenant-1',
            type: 'assistant',
            entityId: 'xpert-tenant-1',
            createdById: 'owner-user-1'
        })
        ;(RequestContext.currentRequest as jest.Mock).mockReturnValue(request)
        ;(RequestContext.currentUser as jest.Mock).mockImplementation(() => request.user)

        const commandBus = {
            execute: jest.fn(async (command) => {
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    return {
                        id: 'execution-1'
                    }
                }

                if (command instanceof XpertChatCommand) {
                    return of({
                        data: {
                            data: null
                        }
                    } as any)
                }

                return null
            })
        }
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'GetChatConversationQuery') {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        xpertId: 'xpert-tenant-1',
                        options: {}
                    }
                }

                return null
            })
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                id: 'xpert-tenant-1',
                tenantId: 'tenant-1',
                organizationId: null,
                user: {
                    id: 'assistant-user-1',
                    tenantId: 'tenant-1',
                    username: 'assistant-user'
                }
            })
        }

        const handler = new RunCreateStreamHandler(
            commandBus as any,
            queryBus as any,
            {
                findOne: jest.fn().mockResolvedValue(undefined)
            } as any,
            {
                appendEvent: jest.fn().mockResolvedValue(undefined),
                appendCompleteEvent: jest.fn().mockResolvedValue(undefined)
            } as any,
            publishedXpertAccessService as any
        )

        await handler.execute({
            threadId: 'thread-1',
            runCreate: {
                assistant_id: 'xpert-tenant-1',
                input: {
                    action: 'send',
                    message: {
                        input: {
                            input: 'Create assistant'
                        }
                    }
                }
            }
        } as any)

        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-tenant-1', {
            relations: ['user', 'createdBy']
        })
        expect(request.headers['organization-id']).toBeUndefined()
        expect(request.headers['x-scope-level']).toBe('tenant')
        expect(request.user).toMatchObject({
            id: 'assistant-user-1',
            tenantId: 'tenant-1',
            principalType: 'api_key',
            ownerUserId: 'owner-user-1'
        })
    })

    it('keeps an explicit api key request user when resolving assistant runs', async () => {
        const request = {
            headers: {
                'organization-id': 'org-created-by-owner'
            },
            user: {
                id: 'end-user-1',
                tenantId: 'tenant-1',
                ownerUserId: 'owner-user-1',
                requestedUserId: 'end-user-1',
                principalType: 'api_key'
            }
        }
        ;(RequestContext.currentApiKey as jest.Mock).mockReturnValue({
            id: 'key-1',
            tenantId: 'tenant-1',
            type: 'assistant',
            entityId: 'xpert-tenant-1',
            createdById: 'owner-user-1'
        })
        ;(RequestContext.currentRequest as jest.Mock).mockReturnValue(request)
        ;(RequestContext.currentUser as jest.Mock).mockImplementation(() => request.user)

        const commandBus = {
            execute: jest.fn(async (command) => {
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    return {
                        id: 'execution-1'
                    }
                }

                if (command instanceof XpertChatCommand) {
                    return of({
                        data: {
                            data: null
                        }
                    } as any)
                }

                return null
            })
        }
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'GetChatConversationQuery') {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        xpertId: 'xpert-tenant-1',
                        options: {}
                    }
                }

                return null
            })
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                id: 'xpert-tenant-1',
                tenantId: 'tenant-1',
                organizationId: null,
                user: {
                    id: 'assistant-user-1',
                    tenantId: 'tenant-1',
                    username: 'assistant-user'
                }
            })
        }

        const handler = new RunCreateStreamHandler(
            commandBus as any,
            queryBus as any,
            {
                findOne: jest.fn().mockResolvedValue(undefined)
            } as any,
            {
                appendEvent: jest.fn().mockResolvedValue(undefined),
                appendCompleteEvent: jest.fn().mockResolvedValue(undefined)
            } as any,
            publishedXpertAccessService as any
        )

        await handler.execute({
            threadId: 'thread-1',
            runCreate: {
                assistant_id: 'xpert-tenant-1',
                input: {
                    action: 'send',
                    message: {
                        input: {
                            input: 'Create assistant'
                        }
                    }
                }
            }
        } as any)

        expect(request.headers['organization-id']).toBeUndefined()
        expect(request.headers['x-scope-level']).toBe('tenant')
        expect(request.user).toMatchObject({
            id: 'end-user-1',
            tenantId: 'tenant-1',
            requestedUserId: 'end-user-1',
            principalType: 'api_key',
            ownerUserId: 'owner-user-1'
        })
    })
})
