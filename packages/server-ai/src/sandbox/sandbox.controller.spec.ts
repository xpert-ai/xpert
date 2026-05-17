import { ForbiddenException } from '@nestjs/common'
import { SandboxManagedServiceErrorCode } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter } from 'events'
import type { Request, Response } from 'express'
import type { I18nService } from 'nestjs-i18n'
import { firstValueFrom, toArray } from 'rxjs'
import { RequestContext } from '@xpert-ai/server-core'
import type { VolumeClient } from '../shared'
import type { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
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

jest.mock('./sandbox-conversation-context.service', () => ({
    SandboxConversationContextService: class SandboxConversationContextService {}
}))

jest.mock('./sandbox-managed-service.service', () => ({
    SandboxManagedServiceService: class SandboxManagedServiceService {}
}))

jest.mock('./sandbox-preview-auth.guard', () => ({
    SandboxPreviewAuthGuard: class SandboxPreviewAuthGuard {}
}))

jest.mock('./sandbox-preview-session.service', () => ({
    SANDBOX_PREVIEW_COOKIE_NAME: 'xpert_sandbox_preview',
    SandboxPreviewSessionService: class SandboxPreviewSessionService {}
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
    let sandboxConversationContextService: {
        resolveConversationSandbox: jest.Mock
    }
    let sandboxManagedServiceService: {
        listByConversationId: jest.Mock
        listByThreadId: jest.Mock
        startByConversationId: jest.Mock
        startByThreadId: jest.Mock
        getLogsByConversationId: jest.Mock
        getLogsByThreadId: jest.Mock
        getByConversationId: jest.Mock
        getByThreadId: jest.Mock
        stopByConversationId: jest.Mock
        stopByThreadId: jest.Mock
        restartByConversationId: jest.Mock
        restartByThreadId: jest.Mock
        proxyByConversationId: jest.Mock
    }
    let sandboxPreviewSessionService: {
        createSession: jest.Mock
    }
    let organizationScopeService: {
        run: jest.Mock
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
        sandboxConversationContextService = {
            resolveConversationSandbox: jest.fn()
        }
        sandboxManagedServiceService = {
            listByConversationId: jest.fn(),
            listByThreadId: jest.fn(),
            startByConversationId: jest.fn(),
            startByThreadId: jest.fn(),
            getLogsByConversationId: jest.fn(),
            getLogsByThreadId: jest.fn(),
            getByConversationId: jest.fn(),
            getByThreadId: jest.fn(),
            stopByConversationId: jest.fn(),
            stopByThreadId: jest.fn(),
            restartByConversationId: jest.fn(),
            restartByThreadId: jest.fn(),
            proxyByConversationId: jest.fn()
        }
        sandboxPreviewSessionService = {
            createSession: jest.fn()
        }
        organizationScopeService = {
            run: jest.fn((_organizationId: string | undefined, callback: () => unknown) => callback())
        }
        volumeClient = {
            resolve: jest.fn()
        }

        controller = new SandboxController(
            {} as unknown as I18nService,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            sandboxConversationContextService as unknown as SandboxConversationContextService,
            sandboxManagedServiceService as unknown as SandboxManagedServiceService,
            sandboxPreviewSessionService as unknown as SandboxPreviewSessionService,
            organizationScopeService as unknown as SuperAdminOrganizationScopeService,
            volumeClient as unknown as VolumeClient
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('acquires the sandbox backend using the conversation xpert sandbox provider', async () => {
        commandBus.execute.mockResolvedValue({
            id: 'sandbox-1',
            execute: jest.fn().mockResolvedValue({
                output: 'file-a',
                exitCode: 0,
                truncated: false
            })
        })
        sandboxConversationContextService.resolveConversationSandbox.mockResolvedValue({
            backend: {
                execute: jest.fn().mockResolvedValue({
                    output: 'file-a',
                    exitCode: 0,
                    truncated: false
                })
            },
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
        sandboxConversationContextService.resolveConversationSandbox.mockResolvedValue({
            backend: {
                execute: jest.fn().mockResolvedValue({
                    output: 'file-b',
                    exitCode: 0,
                    truncated: false
                })
            },
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
            controller.terminal({ cmd: 'ls' }, null, 'conversation-1', new EventEmitter() as unknown as Response)
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

    it('lists managed sandbox services for a thread', async () => {
        sandboxManagedServiceService.listByThreadId.mockResolvedValue([
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

        await expect(controller.listManagedServicesByThread('thread-1', 'org-1')).resolves.toEqual([
            expect.objectContaining({
                id: 'service-1',
                name: 'web',
                status: 'running'
            })
        ])
        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(sandboxManagedServiceService.listByThreadId).toHaveBeenCalledWith('thread-1')
    })

    it('gets a managed sandbox service for a thread', async () => {
        sandboxManagedServiceService.getByThreadId.mockResolvedValue({
            id: 'service-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox',
            name: 'web',
            command: 'npm run dev',
            workingDirectory: '/workspace/project-1',
            status: 'running',
            transportMode: 'http'
        })

        await expect(controller.getManagedServiceByThread('thread-1', 'service-1', 'org-1')).resolves.toEqual(
            expect.objectContaining({
                id: 'service-1',
                status: 'running'
            })
        )
        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(sandboxManagedServiceService.getByThreadId).toHaveBeenCalledWith('thread-1', 'service-1')
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

    it('starts a managed sandbox service for a thread', async () => {
        const input = {
            command: 'npm run dev',
            name: 'web',
            port: 4173
        }
        sandboxManagedServiceService.startByThreadId.mockResolvedValue({
            id: 'service-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox',
            name: 'web',
            command: 'npm run dev',
            workingDirectory: '/workspace/project-1',
            status: 'running',
            transportMode: 'http',
            actualPort: 4173
        })

        await expect(controller.startManagedServiceByThread('thread-1', input, 'org-1')).resolves.toEqual(
            expect.objectContaining({
                id: 'service-1',
                actualPort: 4173
            })
        )
        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(sandboxManagedServiceService.startByThreadId).toHaveBeenCalledWith('thread-1', input)
    })

    it('stops a managed sandbox service for a thread', async () => {
        sandboxManagedServiceService.stopByThreadId.mockResolvedValue({
            id: 'service-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox',
            name: 'web',
            command: 'npm run dev',
            workingDirectory: '/workspace/project-1',
            status: 'stopped',
            transportMode: 'http'
        })

        await expect(controller.stopManagedServiceByThread('thread-1', 'service-1', 'org-1')).resolves.toEqual(
            expect.objectContaining({
                id: 'service-1',
                status: 'stopped'
            })
        )
        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(sandboxManagedServiceService.stopByThreadId).toHaveBeenCalledWith('thread-1', 'service-1')
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

    it('returns thread managed service logs with an optional tail size', async () => {
        sandboxManagedServiceService.getLogsByThreadId.mockResolvedValue({
            stdout: 'ready',
            stderr: ''
        })

        await expect(
            controller.getManagedServiceLogsByThread('thread-1', 'service-1', '120', 'org-1')
        ).resolves.toEqual({
            stdout: 'ready',
            stderr: ''
        })
        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(sandboxManagedServiceService.getLogsByThreadId).toHaveBeenCalledWith('thread-1', 'service-1', 120)
    })

    it('restarts a managed sandbox service for a thread', async () => {
        sandboxManagedServiceService.restartByThreadId.mockResolvedValue({
            id: 'service-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox',
            name: 'web',
            command: 'npm run dev',
            workingDirectory: '/workspace/project-1',
            status: 'running',
            transportMode: 'http'
        })

        await expect(controller.restartManagedServiceByThread('thread-1', 'service-1', 'org-1')).resolves.toEqual(
            expect.objectContaining({
                id: 'service-1',
                status: 'running'
            })
        )
        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(sandboxManagedServiceService.restartByThreadId).toHaveBeenCalledWith('thread-1', 'service-1')
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
                undefined,
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

    it('creates a thread preview session cookie for iframe access', async () => {
        const request = {
            headers: {
                'x-forwarded-proto': 'https'
            },
            secure: false
        } as unknown as Request
        const response = {
            cookie: jest.fn()
        }

        sandboxManagedServiceService.getByThreadId.mockResolvedValue({
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
            controller.createManagedServicePreviewSessionByThread(
                'thread-1',
                'service-1',
                'org-1',
                request,
                response as unknown as Response
            )
        ).resolves.toEqual({
            expiresAt: '2026-04-20T13:00:00.000Z',
            previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
        })

        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(sandboxManagedServiceService.getByThreadId).toHaveBeenCalledWith('thread-1', 'service-1')
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
