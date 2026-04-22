import { ForbiddenException } from '@nestjs/common'
import { SandboxManagedServiceErrorCode } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter } from 'events'
import type { Request, Response } from 'express'
import type { I18nService } from 'nestjs-i18n'
import { firstValueFrom, toArray } from 'rxjs'
import { RequestContext } from '@xpert-ai/server-core'
import type { ChatConversationService } from '../chat-conversation'
import type { VolumeClient } from '../shared'
import type { SandboxManagedServiceService } from './sandbox-managed-service.service'
import type { SandboxConversationContextService } from './sandbox-conversation-context.service'
import type { SandboxPreviewSessionService } from './sandbox-preview-session.service'
import { SandboxManagedServiceError } from './sandbox-managed-service.error'
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
    let sandboxConversationContextService: {
        resolveConversationSandbox: jest.Mock
    }
    let sandboxManagedServiceService: {
        listByConversationId: jest.Mock
        startByConversationId: jest.Mock
        getLogsByConversationId: jest.Mock
        getByConversationId: jest.Mock
        stopByConversationId: jest.Mock
        restartByConversationId: jest.Mock
        proxyByConversationId: jest.Mock
    }
    let sandboxPreviewSessionService: {
        createSession: jest.Mock
    }
    let volumeClient: {
        resolve: jest.Mock
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
        sandboxConversationContextService = {
            resolveConversationSandbox: jest.fn()
        }
        sandboxManagedServiceService = {
            listByConversationId: jest.fn(),
            startByConversationId: jest.fn(),
            getLogsByConversationId: jest.fn(),
            getByConversationId: jest.fn(),
            stopByConversationId: jest.fn(),
            restartByConversationId: jest.fn(),
            proxyByConversationId: jest.fn()
        }
        sandboxPreviewSessionService = {
            createSession: jest.fn()
        }
        volumeClient = {
            resolve: jest.fn()
        }

        controller = new SandboxController(
            {} as unknown as I18nService,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            conversationService as unknown as ChatConversationService,
            sandboxConversationContextService as unknown as SandboxConversationContextService,
            sandboxManagedServiceService as unknown as SandboxManagedServiceService,
            sandboxPreviewSessionService as unknown as SandboxPreviewSessionService,
            volumeClient as unknown as VolumeClient
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
        sandboxConversationContextService.resolveConversationSandbox.mockResolvedValue({
            effectiveProjectId: 'project-1',
            provider: 'local-shell-sandbox',
            sandbox: {
                backend: {
                    execute: jest.fn().mockResolvedValue({
                        output: 'file-a',
                        exitCode: 0,
                        truncated: false
                    })
                }
            },
            workingDirectory: '/workspace/project-1'
        })

        const res = new EventEmitter() as ResponseLike
        const stream$ = await controller.terminal({ cmd: 'ls' }, null, 'conversation-1', res as unknown as Response)
        const items = await firstValueFrom(stream$.pipe(toArray()))

        expect(sandboxConversationContextService.resolveConversationSandbox).toHaveBeenCalledWith({
            conversationId: 'conversation-1',
            projectId: null
        })
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
        sandboxConversationContextService.resolveConversationSandbox.mockResolvedValue({
            effectiveProjectId: null,
            provider: 'local-shell-sandbox',
            sandbox: {
                backend: {
                    execute: jest.fn().mockResolvedValue({
                        output: 'file-b',
                        exitCode: 0,
                        truncated: false
                    })
                }
            },
            workingDirectory: '/workspace/xpert-1/user/user-1'
        })

        const res = new EventEmitter() as ResponseLike
        const stream$ = await controller.terminal({ cmd: 'ls' }, null, 'conversation-1', res as unknown as Response)
        const items = await firstValueFrom(stream$.pipe(toArray()))

        expect(items).toContain('file-b')
    })

    it('rejects terminal access when the conversation sandbox feature is disabled', async () => {
        sandboxConversationContextService.resolveConversationSandbox.mockRejectedValue(
            new ForbiddenException('Sandbox is not enabled for this conversation')
        )

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

    it('lists managed sandbox services for a conversation', async () => {
        sandboxManagedServiceService.listByConversationId.mockResolvedValue([
            {
                id: 'service-1',
                conversationId: 'conversation-1',
                provider: 'local-shell-sandbox',
                name: 'web',
                command: 'npm run dev',
                workingDirectory: '/workspace/project-1',
                status: 'running',
                transportMode: 'http'
            }
        ])

        await expect(controller.listManagedServices('conversation-1')).resolves.toEqual([
            expect.objectContaining({
                id: 'service-1',
                name: 'web',
                status: 'running'
            })
        ])
        expect(sandboxManagedServiceService.listByConversationId).toHaveBeenCalledWith('conversation-1')
    })

    it('maps managed service errors into http exceptions', async () => {
        sandboxManagedServiceService.listByConversationId.mockRejectedValue(
            new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.UnsupportedProvider,
                'Sandbox provider "legacy" does not support managed services.',
                400
            )
        )

        await expect(controller.listManagedServices('conversation-1')).rejects.toMatchObject({
            response: {
                code: SandboxManagedServiceErrorCode.UnsupportedProvider,
                message: 'Sandbox provider "legacy" does not support managed services.'
            }
        })
    })

    it('starts a managed sandbox service for a conversation', async () => {
        const input = {
            command: 'npm run dev',
            name: 'web',
            port: 4173
        }
        sandboxManagedServiceService.startByConversationId.mockResolvedValue({
            id: 'service-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox',
            name: 'web',
            command: 'npm run dev',
            workingDirectory: '/workspace/project-1',
            status: 'running',
            transportMode: 'http',
            actualPort: 4173,
            previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
        })

        await expect(controller.startManagedService('conversation-1', input)).resolves.toEqual(
            expect.objectContaining({
                id: 'service-1',
                actualPort: 4173
            })
        )
        expect(sandboxManagedServiceService.startByConversationId).toHaveBeenCalledWith('conversation-1', input)
    })

    it('returns managed service logs with an optional tail size', async () => {
        sandboxManagedServiceService.getLogsByConversationId.mockResolvedValue({
            stdout: 'ready',
            stderr: ''
        })

        await expect(controller.getManagedServiceLogs('conversation-1', 'service-1', '120')).resolves.toEqual({
            stdout: 'ready',
            stderr: ''
        })
        expect(sandboxManagedServiceService.getLogsByConversationId).toHaveBeenCalledWith(
            'conversation-1',
            'service-1',
            120
        )
    })

    it('proxies managed service requests through the service layer', async () => {
        const request = {
            originalUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/index.html?theme=dark'
        } as never
        const response = {} as never

        await controller['proxyManagedService']('conversation-1', 'service-1', '/index.html', request, response)

        expect(sandboxManagedServiceService.proxyByConversationId).toHaveBeenCalledWith(
            'conversation-1',
            'service-1',
            '/index.html?theme=dark',
            request,
            response
        )
    })

    it('creates a preview session cookie for iframe access', async () => {
        const request = {
            headers: {
                'x-forwarded-proto': 'https'
            },
            secure: false
        } as unknown as Request
        const response = {
            cookie: jest.fn()
        }

        sandboxManagedServiceService.getByConversationId.mockResolvedValue({
            id: 'service-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox',
            name: 'web',
            command: 'npm run dev',
            workingDirectory: '/workspace/project-1',
            status: 'running',
            transportMode: 'http',
            previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
        })
        sandboxPreviewSessionService.createSession.mockReturnValue({
            cookie: {
                name: 'xpert_sandbox_preview',
                options: {
                    httpOnly: true,
                    maxAge: 3600000,
                    path: '/api/sandbox/conversations/conversation-1/services/service-1/proxy',
                    sameSite: 'lax',
                    secure: true
                },
                value: 'preview-token'
            },
            expiresAt: '2026-04-20T13:00:00.000Z',
            previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
        })

        await expect(
            controller.createManagedServicePreviewSession(
                'conversation-1',
                'service-1',
                request,
                response as unknown as Response
            )
        ).resolves.toEqual({
            expiresAt: '2026-04-20T13:00:00.000Z',
            previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
        })

        expect(sandboxManagedServiceService.getByConversationId).toHaveBeenCalledWith('conversation-1', 'service-1')
        expect(sandboxPreviewSessionService.createSession).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'service-1' }),
            { secure: true }
        )
        expect(response.cookie).toHaveBeenCalledWith(
            'xpert_sandbox_preview',
            'preview-token',
            expect.objectContaining({
                path: '/api/sandbox/conversations/conversation-1/services/service-1/proxy',
                secure: true
            })
        )
    })
})

type ResponseLike = EventEmitter & {
    on(event: 'close', listener: () => void): ResponseLike
    off(event: 'close', listener: () => void): ResponseLike
}
