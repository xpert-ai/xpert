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

jest.mock('../../../assistant-binding', () => ({
    AssistantBindingService: class AssistantBindingService {}
}))

jest.mock('@xpert-ai/contracts', () => {
    const actual = jest.requireActual('@xpert-ai/contracts')

    return {
        ...actual,
        RequestScopeLevel: {
            TENANT: 'tenant',
            ORGANIZATION: 'organization'
        }
    }
})

jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentApiKey: jest.fn(),
        currentRequest: jest.fn(),
        currentUser: jest.fn()
    }
}))

import { EMPTY, of } from 'rxjs'
import { ApiKeyBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { hydrateSendRequestHumanInput } from '../../../shared/agent'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { RunCreateStreamHandler, validateRunCreateInput } from './run-create-stream.handler'

const conversation = {
    id: 'conversation-1'
} as any

describe('hydrateSendRequestHumanInput', () => {
    it('hydrates reference-only send payloads into both message and human state', () => {
        const referenceText = ['const region = "cn"', 'const workspace = "workspace-1"'].join('\n')

        expect(
            hydrateSendRequestHumanInput({
                action: 'send',
                message: {
                    input: {
                        input: '',
                        references: [
                            {
                                path: 'src/example.ts',
                                startLine: 10,
                                endLine: 11,
                                text: referenceText,
                                taskId: 'task-1'
                            }
                        ]
                    }
                },
                state: {
                    human: {
                        input: ''
                    }
                }
            })
        ).toEqual({
            action: 'send',
            message: {
                input: {
                    input: `Referenced code:\n[src/example.ts:10-11]\n\`\`\`\n${referenceText}\n\`\`\``,
                    references: [
                        {
                            path: 'src/example.ts',
                            startLine: 10,
                            endLine: 11,
                            text: referenceText,
                            taskId: 'task-1'
                        }
                    ]
                }
            },
            state: {
                human: {
                    input: `Referenced code:\n[src/example.ts:10-11]\n\`\`\`\n${referenceText}\n\`\`\``,
                    references: [
                        {
                            path: 'src/example.ts',
                            startLine: 10,
                            endLine: 11,
                            text: referenceText,
                            taskId: 'task-1'
                        }
                    ]
                }
            }
        })
    })

    it('appends structured quote references when the sender requests platform composition', () => {
        expect(
            hydrateSendRequestHumanInput({
                action: 'send',
                message: {
                    input: {
                        input: 'Summarize the discussion.',
                        referenceComposition: 'compose',
                        references: [
                            {
                                type: 'quote',
                                text: 'The pipeline failed because the sandbox volume was missing.',
                                source: 'Assistant',
                                messageId: 'message-2'
                            }
                        ]
                    }
                }
            })
        ).toEqual({
            action: 'send',
            message: {
                input: {
                    input: 'Summarize the discussion.\n\nReferenced content:\n[Assistant]\n> The pipeline failed because the sandbox volume was missing.',
                    referenceComposition: 'compose',
                    references: [
                        {
                            type: 'quote',
                            text: 'The pipeline failed because the sandbox volume was missing.',
                            source: 'Assistant',
                            messageId: 'message-2'
                        }
                    ]
                }
            }
        })
    })

    it('preserves an existing human reference array when synthesizing input', () => {
        const result = hydrateSendRequestHumanInput({
            action: 'send',
            message: {
                input: {
                    input: '',
                    references: [
                        {
                            path: 'src/example.ts',
                            startLine: 3,
                            endLine: 3,
                            text: 'const answer = 42'
                        }
                    ]
                }
            },
            state: {
                human: {
                    input: '',
                    references: [
                        {
                            path: 'src/existing.ts',
                            startLine: 1,
                            endLine: 1,
                            text: 'keep me'
                        }
                    ]
                }
            }
        })

        expect(result).toMatchObject({
            state: {
                human: {
                    references: [
                        {
                            path: 'src/existing.ts',
                            startLine: 1,
                            endLine: 1,
                            text: 'keep me'
                        }
                    ]
                }
            }
        })
    })

    it('keeps an explicit input untouched when references are present but composition was not requested', () => {
        expect(
            hydrateSendRequestHumanInput({
                action: 'send',
                message: {
                    input: {
                        input: 'Keep this exactly as-is.',
                        references: [
                            {
                                type: 'quote',
                                text: 'Do not duplicate me.',
                                source: 'Assistant'
                            }
                        ]
                    }
                }
            })
        ).toEqual({
            action: 'send',
            message: {
                input: {
                    input: 'Keep this exactly as-is.',
                    references: [
                        {
                            type: 'quote',
                            text: 'Do not duplicate me.',
                            source: 'Assistant'
                        }
                    ]
                }
            }
        })
    })
})

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

    it('hydrates legacy reference-only payloads into real human input', () => {
        const referenceText = [
            'gramming Language :: Python :: 3.12",',
            '    "Programming Language :: Python",',
            '    "Topic :: Software Development",',
            ']',
            'requires-python = ">=3.10,<3.13"',
            'dynamic = ["dependencies", "optional-dependencies", "version"]',
            ' ',
            '[project.urls]'
        ].join('\n')

        const result = validateRunCreateInput(
            {
                conversationId: 'conversation-1',
                input: {
                    input: '',
                    references: [
                        {
                            label: 'pyproject.toml 14-21',
                            path: 'pyproject.toml',
                            startLine: 14,
                            endLine: 21,
                            text: referenceText,
                            taskId: 'task-1'
                        }
                    ]
                },
                state: {
                    human: {
                        input: '',
                        references: [
                            {
                                label: 'pyproject.toml 14-21',
                                path: 'pyproject.toml',
                                startLine: 14,
                                endLine: 21,
                                text: referenceText,
                                taskId: 'task-1'
                            }
                        ]
                    }
                }
            },
            conversation
        )

        const synthesizedInput = `Referenced code:\n[pyproject.toml:14-21]\n\`\`\`\n${referenceText}\n\`\`\``

        expect(result).toEqual({
            action: 'send',
            conversationId: 'conversation-1',
            message: {
                input: {
                    input: synthesizedInput,
                    references: [
                        {
                            label: 'pyproject.toml 14-21',
                            path: 'pyproject.toml',
                            startLine: 14,
                            endLine: 21,
                            text: referenceText,
                            taskId: 'task-1'
                        }
                    ]
                }
            },
            state: {
                human: {
                    input: synthesizedInput,
                    references: [
                        {
                            label: 'pyproject.toml 14-21',
                            path: 'pyproject.toml',
                            startLine: 14,
                            endLine: 21,
                            text: referenceText,
                            taskId: 'task-1'
                        }
                    ]
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
            }),
            getPublishedXpertInTenant: jest.fn()
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn().mockResolvedValue(false)
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
            publishedXpertAccessService as any,
            assistantBindingService as any
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
        expect(publishedXpertAccessService.getPublishedXpertInTenant).not.toHaveBeenCalled()
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
            }),
            getPublishedXpertInTenant: jest.fn()
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn().mockResolvedValue(false)
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
            publishedXpertAccessService as any,
            assistantBindingService as any
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
            ownerUserId: 'owner-user-1',
            apiKeyUserId: 'assistant-user-1',
            requestedOrganizationId: null
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
            }),
            getPublishedXpertInTenant: jest.fn()
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn().mockResolvedValue(false)
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
            publishedXpertAccessService as any,
            assistantBindingService as any
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

    it('allows workspace-bound api keys for assistants in the same workspace', async () => {
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
            type: ApiKeyBindingType.WORKSPACE,
            entityId: 'workspace-1',
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
                        xpertId: 'xpert-workspace-1',
                        options: {}
                    }
                }

                return null
            })
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                id: 'xpert-workspace-1',
                tenantId: 'tenant-1',
                organizationId: null,
                workspaceId: 'workspace-1',
                user: {
                    id: 'assistant-user-1',
                    tenantId: 'tenant-1',
                    username: 'assistant-user'
                }
            }),
            getPublishedXpertInTenant: jest.fn()
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn().mockResolvedValue(false)
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
            publishedXpertAccessService as any,
            assistantBindingService as any
        )

        await handler.execute({
            threadId: 'thread-1',
            runCreate: {
                assistant_id: 'xpert-workspace-1',
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

        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-workspace-1', {
            relations: ['user', 'createdBy']
        })
        expect(request.headers['organization-id']).toBeUndefined()
        expect(request.headers['x-scope-level']).toBe('tenant')
    })

    it('rejects workspace-bound api keys for assistants in a different workspace', async () => {
        ;(RequestContext.currentApiKey as jest.Mock).mockReturnValue({
            id: 'key-1',
            tenantId: 'tenant-1',
            type: ApiKeyBindingType.WORKSPACE,
            entityId: 'workspace-1',
            createdById: 'owner-user-1'
        })
        ;(RequestContext.currentRequest as jest.Mock).mockReturnValue({
            headers: {
                'organization-id': 'org-created-by-owner'
            }
        })
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(null)

        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'GetChatConversationQuery') {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        xpertId: 'xpert-workspace-2',
                        options: {}
                    }
                }

                return null
            })
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                id: 'xpert-workspace-2',
                tenantId: 'tenant-1',
                organizationId: null,
                workspaceId: 'workspace-2'
            }),
            getPublishedXpertInTenant: jest.fn()
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn().mockResolvedValue(false)
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
            publishedXpertAccessService as any,
            assistantBindingService as any
        )

        await expect(
            handler.execute({
                threadId: 'thread-1',
                runCreate: {
                    assistant_id: 'xpert-workspace-2',
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
        ).rejects.toThrow('API key is not allowed to access this workspace assistant.')

        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-workspace-2', {
            relations: ['user', 'createdBy']
        })
    })

    it('loads system-bound assistants from tenant scope when the assistant id matches the effective binding', async () => {
        ;(RequestContext.currentApiKey as jest.Mock).mockReturnValue(null)
        const commandBus = {
            execute: jest.fn(async (command) => {
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    return { id: 'execution-1' }
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
                        xpertId: 'org-assistant-1',
                        options: {}
                    }
                }

                return null
            })
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(),
            getPublishedXpertInTenant: jest.fn().mockResolvedValue({
                id: 'org-assistant-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                environmentId: null
            })
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn().mockResolvedValue(true)
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
            publishedXpertAccessService as any,
            assistantBindingService as any
        )

        await handler.execute({
            threadId: 'thread-1',
            runCreate: {
                assistant_id: 'org-assistant-1',
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

        expect(assistantBindingService.isEffectiveSystemAssistantId).toHaveBeenCalledWith('org-assistant-1')
        expect(publishedXpertAccessService.getPublishedXpertInTenant).toHaveBeenCalledWith('org-assistant-1', {
            relations: ['user', 'createdBy']
        })
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()
    })

    it('does not append a complete SSE event when background follow_up is submitted', async () => {
        ;(RequestContext.currentApiKey as jest.Mock).mockReturnValue(null)
        const appendEvent = jest.fn().mockResolvedValue(undefined)
        const appendCompleteEvent = jest.fn().mockResolvedValue(undefined)
        const commandBus = {
            execute: jest.fn(async (command) => {
                if (command instanceof XpertChatCommand) {
                    return EMPTY
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
                        status: 'busy',
                        options: {}
                    }
                }

                if (query.constructor.name === 'XpertAgentExecutionOneQuery') {
                    return {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    }
                }

                return {
                    id: 'xpert-1'
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
                appendEvent,
                appendCompleteEvent
            } as any,
            {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                    id: 'xpert-1',
                    environmentId: null
                }),
                getPublishedXpertInTenant: jest.fn()
            } as any,
            {
                isEffectiveSystemAssistantId: jest.fn().mockResolvedValue(false)
            } as any
        )

        const { stream } = await handler.execute({
            threadId: 'thread-1',
            runCreate: {
                assistant_id: 'xpert-1',
                input: {
                    action: 'follow_up',
                    conversationId: 'conversation-1',
                    mode: 'steer',
                    target: {
                        executionId: 'execution-1'
                    },
                    message: {
                        clientMessageId: 'client-message-1',
                        input: {
                            input: 'Please change direction'
                        }
                    }
                }
            }
        } as any)

        await new Promise<void>((resolve, reject) => {
            stream.subscribe({
                complete: () => resolve(),
                error: reject
            })
        })

        expect(appendEvent).not.toHaveBeenCalled()
        expect(appendCompleteEvent).not.toHaveBeenCalled()
    })
})
