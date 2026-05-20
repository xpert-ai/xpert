import { NotFoundException } from '@nestjs/common'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { LanguagesEnum, TChatOptions, TChatRequest } from '@xpert-ai/contracts'
import { RequestContext, UserService } from '@xpert-ai/server-core'
import { EventEmitter } from 'events'
import type { Response } from 'express'
import type { I18nService } from 'nestjs-i18n'
import { EMPTY, Observable } from 'rxjs'
import type { CopilotStoreService } from '../copilot-store/copilot-store.service'
import type { EnvironmentService } from '../environment'
import type { RuntimeCapabilitiesService } from '../ai/runtime-capabilities.service'
import { XpertController } from './xpert.controller'
import type { XpertService } from './xpert.service'

jest.mock('@xpert-ai/server-core', () => ({
    CrudController: class {
        constructor() {}
    },
    FileStorage: class {
        storage() {
            return {}
        }
    },
    OptionParams: class {},
    PaginationParams: class {},
    ParseJsonPipe: class {},
    PermissionGuard: class {},
    Permissions: () => () => undefined,
    Public: () => () => undefined,
    RequestContext: {
        currentRequest: jest.fn(),
        currentTenantId: jest.fn(),
        currentUser: jest.fn(),
        currentUserId: jest.fn(),
        getLanguageCode: jest.fn(),
        getOrganizationId: jest.fn()
    },
    SecretTokenService: class {},
    TenantBaseEntity: class {},
    TenantOrganizationAwareCrudService: class {},
    TenantOrganizationBaseEntity: class {},
    TimeZone: () => () => undefined,
    TransformInterceptor: class {},
    UploadedFileStorage: () => () => undefined,
    UseValidationPipe: () => () => undefined,
    UserService: class {},
    UUIDValidationPipe: class {}
}))

jest.mock('nestjs-i18n', () => ({
    I18nLang: () => () => undefined,
    I18nService: class {}
}))

jest.mock('./auth/anonymous-auth.guard', () => ({
    AnonymousXpertAuthGuard: class {}
}))

jest.mock('./guards/xpert.guard', () => ({
    XpertGuard: class {}
}))

jest.mock('../xpert-workspace/', () => ({
    WorkspaceGuard: class {}
}))

jest.mock('./xpert.service', () => ({
    XpertService: class {}
}))

jest.mock('./xpert-frequent-questions.service', () => ({
    XpertFrequentQuestionsService: class {}
}))

jest.mock('../copilot-store/copilot-store.service', () => ({
    CopilotStoreService: class {}
}))

jest.mock('../environment', () => ({
    EnvironmentService: class {}
}))

jest.mock('../prompt-workflow', () => ({
    PromptWorkflowService: class {}
}))

jest.mock('../ai/runtime-capabilities.service', () => ({
    RUNTIME_CAPABILITY_XPERT_RELATIONS: ['agent', 'agent.copilotModel', 'copilotModel'],
    RuntimeCapabilitiesService: class {}
}))

jest.mock('../core/entities/internal', () => ({
    ChatConversation: class {},
    XpertAgentExecution: class {}
}))

jest.mock('./dto', () => ({
    XpertDraftDslDTO: class {},
    XpertPublicDTO: class {
        constructor(value: unknown) {
            Object.assign(this, value)
        }
    }
}))

jest.mock('../chat-conversation', () => ({
    ChatConversationDeleteCommand: class {},
    ChatConversationLogsQuery: class {},
    ChatConversationUpsertCommand: class {},
    FindChatConversationQuery: class {},
    GetChatConversationQuery: class {},
    StatisticsAverageSessionInteractionsQuery: class {},
    StatisticsDailyConvQuery: class {},
    StatisticsDailyEndUsersQuery: class {},
    StatisticsDailyMessagesQuery: class {},
    StatisticsTokenCostQuery: class {},
    StatisticsTokensPerSecondQuery: class {},
    StatisticsUserSatisfactionRateQuery: class {}
}))

jest.mock('../chat-conversation/dto', () => ({
    ChatConversationPublicDTO: class {
        constructor(value: unknown) {
            Object.assign(this, value)
        }
    }
}))

type EnqueueOptions = TChatOptions & {
    execution?: { id: string }
    fromEndUserId?: string
    isDraft?: boolean
    xpertId?: string
}

type ControllerPrivateAccess = {
    enqueueXpertChatTask(request: TChatRequest, options: EnqueueOptions): Promise<Observable<unknown>>
}

type RuntimeCapabilitiesControllerAccess = {
    getRuntimeCapabilities(id: string, isDraft?: string | boolean | string[]): Promise<unknown>
}

describe('XpertController', () => {
    let controller: XpertController
    let xpertService: {
        findBySlug: jest.Mock
        findOne: jest.Mock
    }
    let environmentService: {
        findOne: jest.Mock
    }
    let handoffQueue: {
        enqueue: jest.Mock
    }
    let agentChatRealtime: {
        createStream: jest.Mock
    }
    let runtimeCapabilitiesService: {
        getRuntimeCapabilities: jest.Mock
    }
    let commandBus: {
        execute: jest.Mock
    }
    let queryBus: {
        execute: jest.Mock
    }

    beforeEach(() => {
        xpertService = {
            findBySlug: jest.fn(),
            findOne: jest.fn()
        }
        environmentService = {
            findOne: jest.fn()
        }
        handoffQueue = {
            enqueue: jest.fn()
        }
        agentChatRealtime = {
            createStream: jest.fn()
        }
        runtimeCapabilitiesService = {
            getRuntimeCapabilities: jest.fn(async () => ({
                skills: [],
                plugins: [],
                subAgents: [],
                commands: []
            }))
        }
        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }

        controller = new XpertController(
            xpertService as unknown as XpertService,
            {} as unknown as CopilotStoreService,
            environmentService as unknown as EnvironmentService,
            {} as unknown as UserService,
            {} as any,
            {} as unknown as I18nService,
            {} as any,
            runtimeCapabilitiesService as unknown as RuntimeCapabilitiesService,
            handoffQueue as any,
            agentChatRealtime as any,
            {} as never,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus
        )
        ;(RequestContext.currentRequest as jest.Mock).mockReturnValue({
            cookies: {
                'anonymous.id': 'anonymous-user-1'
            }
        })
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.getLanguageCode as jest.Mock).mockReturnValue(LanguagesEnum.English)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('enriches public chat-app requests with resolved xpert context before enqueueing', async () => {
        const request: TChatRequest = {
            action: 'send',
            environmentId: 'env-1',
            message: {
                input: {
                    input: 'Hello from public app'
                }
            }
        }
        const options: TChatOptions = {
            messageId: 'message-1'
        }
        const controllerAccess = controller as unknown as ControllerPrivateAccess

        xpertService.findBySlug.mockResolvedValue({
            id: 'xpert-1',
            app: {
                enabled: true,
                public: true
            }
        })
        environmentService.findOne.mockResolvedValue({ id: 'env-1' })

        const enqueueSpy = jest.spyOn(controllerAccess, 'enqueueXpertChatTask').mockResolvedValue(EMPTY)

        await controller.chatApp(
            new EventEmitter() as unknown as Response,
            'claw-xpert',
            LanguagesEnum.English,
            'Asia/Shanghai',
            { request, options }
        )

        expect(xpertService.findBySlug).toHaveBeenCalledWith('claw-xpert')
        expect(environmentService.findOne).toHaveBeenCalledWith('env-1')
        expect(enqueueSpy).toHaveBeenCalledWith(
            request,
            expect.objectContaining({
                environment: { id: 'env-1' },
                from: 'webapp',
                fromEndUserId: 'anonymous-user-1',
                language: LanguagesEnum.English,
                messageId: 'message-1',
                timeZone: 'Asia/Shanghai',
                xpertId: 'xpert-1'
            })
        )
    })

    it('enqueues xpert chat through distributed handoff dispatch and realtime stream', async () => {
        const request: TChatRequest = {
            action: 'send',
            conversationId: 'conversation-1',
            message: {
                input: {
                    input: 'Hello through handoff'
                }
            }
        }
        const realtime$ = new Observable<unknown>()
        const controllerAccess = controller as unknown as ControllerPrivateAccess

        handoffQueue.enqueue.mockResolvedValue(undefined)
        agentChatRealtime.createStream.mockImplementation((_runId: string, start: () => Promise<void>) => {
            void start()
            return realtime$
        })

        const result = await controllerAccess.enqueueXpertChatTask(request, {
            messageId: 'message-1',
            xpertId: 'xpert-1',
            language: LanguagesEnum.English,
            execution: { id: 'execution-1' }
        })

        expect(result).toBe(realtime$)
        expect(agentChatRealtime.createStream).toHaveBeenCalledWith(
            expect.stringMatching(/^xpert-chat-/),
            expect.any(Function)
        )
        expect(handoffQueue.enqueue).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).not.toHaveBeenCalled()

        const message = handoffQueue.enqueue.mock.calls[0][0]
        expect(message).toEqual(
            expect.objectContaining({
                id: expect.stringMatching(/^xpert-chat-/),
                type: 'agent.chat_dispatch.v1',
                version: 1,
                tenantId: 'tenant-1',
                sessionKey: 'conversation-1',
                businessKey: 'conversation-1',
                maxAttempts: 1,
                traceId: 'message-1',
                payload: expect.objectContaining({
                    request,
                    options: expect.objectContaining({
                        messageId: 'message-1',
                        xpertId: 'xpert-1'
                    }),
                    callback: {
                        transport: 'redis-pubsub'
                    },
                    executionId: 'execution-1'
                }),
                headers: expect.objectContaining({
                    organizationId: 'org-1',
                    userId: 'user-1',
                    language: LanguagesEnum.English,
                    conversationId: 'conversation-1',
                    source: 'chat'
                })
            })
        )
    })

    it('rejects public chat-app requests when the xpert slug is missing', async () => {
        const controllerAccess = controller as unknown as ControllerPrivateAccess
        const enqueueSpy = jest.spyOn(controllerAccess, 'enqueueXpertChatTask')

        xpertService.findBySlug.mockResolvedValue(null)

        await expect(
            controller.chatApp(
                new EventEmitter() as unknown as Response,
                'missing-xpert',
                LanguagesEnum.English,
                'UTC',
                {
                    request: {
                        action: 'send',
                        message: {
                            input: {
                                input: 'Hello'
                            }
                        }
                    },
                    options: {}
                }
            )
        ).rejects.toBeInstanceOf(NotFoundException)

        expect(enqueueSpy).not.toHaveBeenCalled()
        expect(environmentService.findOne).not.toHaveBeenCalled()
    })

    it('loads runtime capabilities from an unpublished xpert draft', async () => {
        const controllerAccess = controller as unknown as RuntimeCapabilitiesControllerAccess

        xpertService.findOne.mockResolvedValue({
            id: 'xpert-1',
            workspaceId: 'workspace-1',
            publishAt: null,
            name: 'Published Xpert',
            title: 'Published Xpert',
            agent: {
                key: 'published-agent'
            },
            graph: {
                nodes: [],
                connections: []
            },
            draft: {
                team: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1',
                    name: 'Draft Xpert',
                    title: 'Draft Xpert',
                    agent: {
                        key: 'draft-agent'
                    }
                },
                nodes: [],
                connections: []
            }
        })

        await expect(controllerAccess.getRuntimeCapabilities('xpert-1', 'true')).resolves.toEqual({
            skills: [],
            plugins: [],
            subAgents: [],
            commands: []
        })

        expect(xpertService.findOne).toHaveBeenCalledWith('xpert-1', {
            relations: ['agent', 'agent.copilotModel', 'copilotModel']
        })
        expect(runtimeCapabilitiesService.getRuntimeCapabilities).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'xpert-1',
                workspaceId: 'workspace-1',
                name: 'Draft Xpert',
                title: 'Draft Xpert',
                agent: {
                    key: 'draft-agent'
                },
                graph: {
                    nodes: [],
                    connections: []
                }
            }),
            'xpert-1'
        )
    })
})
