import { ForbiddenException } from '@nestjs/common'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter } from 'events'
import type { Response } from 'express'
import type { I18nService } from 'nestjs-i18n'
import { firstValueFrom, toArray } from 'rxjs'
import { RequestContext } from '@xpert-ai/server-core'
import type { ChatConversationService } from '../chat-conversation'
import { SandboxAcquireBackendCommand } from './commands'
import { SandboxController } from './sandbox.controller'

jest.mock('@xpert-ai/server-core', () => ({
    GetDefaultTenantQuery: class GetDefaultTenantQuery {},
    Public: () => () => undefined,
    RequestContext: {
        currentTenantId: jest.fn(),
        currentUserId: jest.fn()
    },
    TransformInterceptor: class TransformInterceptor {},
    UploadFileCommand: class UploadFileCommand {},
    getFileAssetDestination: jest.fn()
}))

jest.mock('../chat-conversation', () => ({
    ChatConversationService: class ChatConversationService {}
}))

jest.mock('../shared', () => ({
    VolumeClient: {
        getSharedWorkspacePath: jest.fn().mockResolvedValue('/workspace/project-1'),
        getXpertWorkspacePath: jest.fn().mockResolvedValue('/workspace/xpert-1/user/user-1')
    },
    getMediaTypeWithCharset: jest.fn()
}))

describe('SandboxController', () => {
    let controller: SandboxController
    let commandBus: {
        execute: jest.Mock
    }
    let queryBus: {
        execute: jest.Mock
    }
    let conversationService: {
        findOne: jest.Mock
    }

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }
        conversationService = {
            findOne: jest.fn()
        }

        controller = new SandboxController(
            {} as unknown as I18nService,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            conversationService as unknown as ChatConversationService
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('acquires the sandbox backend using the conversation xpert sandbox provider', async () => {
        conversationService.findOne.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            projectId: 'project-1',
            xpert: {
                features: {
                    sandbox: {
                        enabled: true,
                        provider: 'local-shell-sandbox'
                    }
                }
            }
        })
        commandBus.execute.mockResolvedValue({
            id: 'sandbox-1',
            execute: jest.fn().mockResolvedValue({
                output: 'file-a',
                exitCode: 0,
                truncated: false
            })
        })

        const res = new EventEmitter() as ResponseLike
        const stream$ = await controller.terminal({ cmd: 'ls' }, null, 'conversation-1', res as unknown as Response)
        const items = await firstValueFrom(stream$.pipe(toArray()))

        expect(conversationService.findOne).toHaveBeenCalledWith({
            where: { id: 'conversation-1' },
            relations: ['xpert']
        })
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    provider: 'local-shell-sandbox',
                    workingDirectory: '/workspace/project-1',
                    workFor: {
                        type: 'project',
                        id: 'project-1'
                    }
                })
            })
        )
        expect(items).toContain('file-a')
    })

    it('uses the xpert workspace root for non-project conversations', async () => {
        conversationService.findOne.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            projectId: null,
            xpertId: 'xpert-1',
            xpert: {
                features: {
                    sandbox: {
                        enabled: true,
                        provider: 'local-shell-sandbox'
                    }
                }
            }
        })
        commandBus.execute.mockResolvedValue({
            id: 'sandbox-1',
            execute: jest.fn().mockResolvedValue({
                output: 'file-b',
                exitCode: 0,
                truncated: false
            })
        })

        const res = new EventEmitter() as ResponseLike
        const stream$ = await controller.terminal({ cmd: 'ls' }, null, 'conversation-1', res as unknown as Response)
        const items = await firstValueFrom(stream$.pipe(toArray()))

        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    provider: 'local-shell-sandbox',
                    workingDirectory: '/workspace/xpert-1/user/user-1',
                    workFor: {
                        type: 'user',
                        id: 'user-1'
                    }
                })
            })
        )
        expect(items).toContain('file-b')
    })

    it('rejects terminal access when the conversation sandbox feature is disabled', async () => {
        conversationService.findOne.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            projectId: 'project-1',
            xpert: {
                features: {
                    sandbox: {
                        enabled: false,
                        provider: 'local-shell-sandbox'
                    }
                }
            }
        })

        await expect(
            controller.terminal(
                { cmd: 'ls' },
                null,
                'conversation-1',
                new EventEmitter() as unknown as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})

type ResponseLike = EventEmitter & {
    on(event: 'close', listener: () => void): ResponseLike
    off(event: 'close', listener: () => void): ResponseLike
}
