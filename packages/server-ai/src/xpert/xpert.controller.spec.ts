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
import { XpertController } from './xpert.controller'
import type { XpertService } from './xpert.service'

jest.mock('@xpert-ai/server-core', () => ({
    CrudController: class {
        constructor() {}
    },
    FileStorage: class {},
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
        getOrganizationId: jest.fn()
    },
    TimeZone: () => () => undefined,
    TransformInterceptor: class {},
    UploadedFileStorage: class {},
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

type EnqueueOptions = TChatOptions & {
    execution?: { id: string }
    fromEndUserId?: string
    isDraft?: boolean
    xpertId?: string
}

type ControllerPrivateAccess = {
    enqueueXpertChatTask(request: TChatRequest, options: EnqueueOptions): Promise<Observable<unknown>>
}

describe('XpertController', () => {
    let controller: XpertController
    let xpertService: {
        findBySlug: jest.Mock
    }
    let environmentService: {
        findOne: jest.Mock
    }

    beforeEach(() => {
        xpertService = {
            findBySlug: jest.fn()
        }
        environmentService = {
            findOne: jest.fn()
        }

        controller = new XpertController(
            xpertService as unknown as XpertService,
            {} as unknown as CopilotStoreService,
            environmentService as unknown as EnvironmentService,
            {} as unknown as UserService,
            {} as unknown as I18nService,
            { execute: jest.fn() } as unknown as CommandBus,
            { execute: jest.fn() } as unknown as QueryBus
        )
        ;(RequestContext.currentRequest as jest.Mock).mockReturnValue({
            cookies: {
                'anonymous.id': 'anonymous-user-1'
            }
        })
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
})
