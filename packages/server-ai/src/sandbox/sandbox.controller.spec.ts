import { BadRequestException, ForbiddenException, type ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { SandboxManagedServiceErrorCode } from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { EventEmitter } from 'events'
import type { Request, Response } from 'express'
import { I18nService } from 'nestjs-i18n'
import { firstValueFrom, toArray } from 'rxjs'
import { RequestContext } from '@xpert-ai/server-core'
import {
    VOLUME_CLIENT,
    VolumeClient as RuntimeVolumeClient,
    VolumeHandle as RuntimeVolumeHandle
} from '../shared/volume/volume'
import type { VolumeClient } from '../shared/volume/volume'
import { WorkspacePathMapperFactory } from '../shared/volume/workspace-path-mapper.factory'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { SandboxManagedServiceService } from './sandbox-managed-service.service'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'
import { SandboxPreviewSessionService } from './sandbox-preview-session.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { SandboxManagedServiceError } from './sandbox-managed-service.error'
import { SandboxController } from './sandbox.controller'

jest.mock('@xpert-ai/server-core', () => ({
    GetDefaultTenantQuery: class GetDefaultTenantQuery {},
    Public: () => (_target: object, _key: string | symbol, descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata('isPublic', true, descriptor.value)
    },
    RequestContext: {
        currentTenantId: jest.fn(),
        currentUserId: jest.fn()
    },
    TransformInterceptor: class TransformInterceptor {
        intercept(_context: unknown, next: { handle: () => unknown }) {
            return next.handle()
        }
    },
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

jest.mock('../xpert-project/services/project-access.service', () => ({
    XpertProjectAccessService: class XpertProjectAccessService {}
}))

jest.mock('../shared/volume/volume', () => ({
    VOLUME_CLIENT: Symbol.for('sandbox-controller-test-volume-client'),
    VolumeClient: {
        getApiContainerSandboxVolumeRoot: jest.fn().mockReturnValue('/sandbox/tenant-1'),
        getSharedWorkspacePath: jest.fn().mockResolvedValue('/workspace/project-1'),
        getXpertWorkspacePath: jest.fn().mockResolvedValue('/workspace/xpert-1/user/user-1')
    },
    VolumeHandle: {
        resolvePath: (root: string, subpath: string) => `${root}/${subpath}`,
        openExistingFile: jest.fn().mockRejectedValue(new Error('File not found'))
    },
    assertValidVolumeScopeId: (value: string) => {
        if (!value || value === '.' || value === '..' || value.includes('\0') || /[\\/]/.test(value)) {
            throw new Error('Invalid volume scope identifier')
        }
        return value
    }
}))

jest.mock('../shared/volume/workspace-path-mapper.factory', () => ({
    WorkspacePathMapperFactory: class WorkspacePathMapperFactory {}
}))

jest.mock('../shared/utils/utils', () => ({
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
    let projectAccessService: {
        assertCanRead: jest.Mock
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
        projectAccessService = {
            assertCanRead: jest.fn().mockResolvedValue({
                project: {
                    id: 'project-1',
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1'
                },
                role: 'member'
            })
        }

        controller = new SandboxController(
            {} as unknown as I18nService,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            sandboxConversationContextService as unknown as SandboxConversationContextService,
            sandboxManagedServiceService as unknown as SandboxManagedServiceService,
            sandboxPreviewSessionService as unknown as SandboxPreviewSessionService,
            organizationScopeService as unknown as SuperAdminOrganizationScopeService,
            {} as WorkspacePathMapperFactory,
            projectAccessService as unknown as XpertProjectAccessService,
            volumeClient as unknown as VolumeClient
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('rejects user-xpert files through the anonymous volume route', async () => {
        await expect(
            controller.getVolumeFile(
                ['user', 'user-1', 'xpert', 'xpert-1', 'report.txt'],
                undefined,
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('rejects legacy user-isolated xpert files through the anonymous volume route', async () => {
        await expect(
            controller.getVolumeFile(
                ['xpert', 'xpert-1', 'user', 'user-1', 'report.txt'],
                undefined,
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it.each(['project.md', 'skills/pdf/SKILL.md', 'shared/report.txt', 'agents/xpert-1/output.txt'])(
        'rejects Project content through the anonymous volume route: %s',
        async (filePath) => {
            await expect(
                controller.getVolumeFile(
                    ['project', 'project-1', ...filePath.split('/')],
                    undefined,
                    undefined,
                    { headers: {} } as Request,
                    {} as Response
                )
            ).rejects.toBeInstanceOf(ForbiddenException)
            expect(RuntimeVolumeHandle.openExistingFile).not.toHaveBeenCalled()
        }
    )

    it('resolves authenticated Project files from the persisted Project tenant', async () => {
        volumeClient.resolve.mockReturnValue({ serverRoot: '/missing/project-1' })
        const response = createMissingFileResponse()

        await controller.getProjectVolumeFile(
            'project-1',
            ['shared', 'report.txt'],
            undefined,
            undefined,
            { headers: {} } as Request,
            response
        )

        expect(projectAccessService.assertCanRead).toHaveBeenCalledWith('project-1')
        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1'
        })
        expect(response.status).toHaveBeenCalledWith(404)
    })

    it('rejects Project files for a non-member or removed member', async () => {
        projectAccessService.assertCanRead.mockRejectedValueOnce(new ForbiddenException('membership required'))

        await expect(
            controller.getProjectVolumeFile(
                'project-1',
                ['project.md'],
                undefined,
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(volumeClient.resolve).not.toHaveBeenCalled()
    })

    it('does not let the Project tenant query select another volume root', async () => {
        await expect(
            controller.getProjectVolumeFile(
                'project-1',
                ['shared', 'report.txt'],
                'tenant-2',
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(volumeClient.resolve).not.toHaveBeenCalled()
    })

    it.each(['../tenant-2', 'tenant-1/user/user-1/xpert/xpert-1'])(
        'rejects an unsafe tenant root from the anonymous volume route: %s',
        async (tenant) => {
            await expect(
                controller.getVolumeFile(
                    ['xpert', 'xpert-1', 'report.txt'],
                    tenant,
                    undefined,
                    { headers: {} } as Request,
                    {} as Response
                )
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(RuntimeVolumeClient.getApiContainerSandboxVolumeRoot).not.toHaveBeenCalled()
        }
    )

    it('rejects repeated download query values before opening a volume file', async () => {
        await expect(
            controller.getVolumeFile(
                ['project', 'project-1', 'report.txt'],
                'tenant-1',
                ['1', '1'],
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(RuntimeVolumeHandle.openExistingFile).not.toHaveBeenCalled()
    })

    it('rejects a public-path symlink that resolves into a private xpert subtree', async () => {
        const close = jest.fn().mockResolvedValue(undefined)
        jest.spyOn(RuntimeVolumeHandle, 'openExistingFile').mockResolvedValueOnce({
            fileHandle: { close } as never,
            filePath: '/sandbox/tenant-1/user/user-1/xpert/xpert-1/report.txt',
            volumeRelativePath: 'user/user-1/xpert/xpert-1/report.txt',
            descriptorPath: '/proc/self/fd/10',
            fileStat: { isFile: () => true, size: 1 } as never
        })

        await expect(
            controller.getVolumeFile(
                ['xpert', 'shared-xpert', 'leak', 'report.txt'],
                'tenant-1',
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('rejects a public Xpert symlink that resolves into a Project subtree', async () => {
        const close = jest.fn().mockResolvedValue(undefined)
        jest.spyOn(RuntimeVolumeHandle, 'openExistingFile').mockResolvedValueOnce({
            fileHandle: { close } as never,
            filePath: '/sandbox/tenant-1/project/project-1/project.md',
            volumeRelativePath: 'project/project-1/project.md',
            descriptorPath: '/proc/self/fd/11',
            fileStat: { isFile: () => true, size: 1 } as never
        })

        await expect(
            controller.getVolumeFile(
                ['xpert', 'shared-xpert', 'project-link', 'project.md'],
                'tenant-1',
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('keeps legacy shared Xpert files on the anonymous compatibility route', async () => {
        const response = createMissingFileResponse()

        await controller.getVolumeFile(
            ['xpert', 'xpert-1', 'report.txt'],
            'tenant-1',
            undefined,
            { headers: {} } as Request,
            response
        )

        expect(RuntimeVolumeHandle.openExistingFile).toHaveBeenCalledWith(
            '/sandbox/tenant-1',
            'xpert/xpert-1/report.txt'
        )
        expect(response.status).toHaveBeenCalledWith(404)
    })

    it.each([
        ['decoded parent traversal', ['foo', '..', 'user', 'user-1', 'xpert', 'xpert-1', 'report.txt']],
        ['backslash parent traversal', ['foo\\..\\user\\user-1\\xpert\\xpert-1\\report.txt']],
        ['absolute path', ['/user/user-1/xpert/xpert-1/report.txt']]
    ])('rejects %s before resolving the anonymous volume path', async (_case, paths) => {
        await expect(
            controller.getVolumeFile(paths, undefined, undefined, { headers: {} } as Request, {} as Response)
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('rejects cross-user and cross-tenant access to user-xpert files', async () => {
        await expect(
            controller.getUserXpertVolumeFile(
                'user-2',
                'xpert-1',
                ['report.txt'],
                undefined,
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        await expect(
            controller.getUserXpertVolumeFile(
                'user-1',
                'xpert-1',
                ['report.txt'],
                'tenant-2',
                undefined,
                { headers: {} } as Request,
                {} as Response
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(volumeClient.resolve).not.toHaveBeenCalled()
    })

    it.each(['../../../user/user-2/xpert/xpert-2', '..\\..\\..\\user\\user-2\\xpert\\xpert-2'])(
        'rejects an unsafe xpert route identifier before resolving its volume: %s',
        async (xpertId) => {
            await expect(
                controller.getUserXpertVolumeFile(
                    'user-1',
                    xpertId,
                    ['report.txt'],
                    undefined,
                    undefined,
                    { headers: {} } as Request,
                    {} as Response
                )
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(volumeClient.resolve).not.toHaveBeenCalled()
        }
    )

    it('resolves authenticated user-xpert files only from the current tenant and user scope', async () => {
        volumeClient.resolve.mockReturnValue({ serverRoot: '/missing/user-1/xpert-1' })
        const response = new EventEmitter() as Response & {
            status: jest.Mock
            send: jest.Mock
        }
        response.status = jest.fn().mockReturnValue(response)
        response.send = jest.fn().mockReturnValue(response)

        await controller.getUserXpertVolumeFile(
            'user-1',
            'xpert-1',
            ['report.txt'],
            'tenant-1',
            undefined,
            { headers: {} } as Request,
            response
        )

        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'user-xperts',
            userId: 'user-1',
            xpertId: 'xpert-1'
        })
        expect(response.status).toHaveBeenCalledWith(404)
    })

    it('keeps authenticated access to the legacy user-isolated xpert layout', async () => {
        volumeClient.resolve.mockReturnValue({ serverRoot: '/missing/xpert-1/user/user-1' })
        const response = new EventEmitter() as Response & {
            status: jest.Mock
            send: jest.Mock
        }
        response.status = jest.fn().mockReturnValue(response)
        response.send = jest.fn().mockReturnValue(response)

        await controller.getLegacyUserXpertVolumeFile(
            'xpert-1',
            'user-1',
            ['report.txt'],
            'tenant-1',
            undefined,
            { headers: {} } as Request,
            response
        )

        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            userId: 'user-1',
            xpertId: 'xpert-1',
            isolateByUser: true
        })
        expect(response.status).toHaveBeenCalledWith(404)
    })

    describe('registered volume routes', () => {
        it('keeps the Project route authenticated while the compatibility wildcard remains public', () => {
            expect(Reflect.getMetadata('isPublic', SandboxController.prototype.getProjectVolumeFile)).not.toBe(true)
            expect(Reflect.getMetadata('isPublic', SandboxController.prototype.getVolumeFile)).toBe(true)
        })

        it('routes anonymous Project URLs to the authenticated Project handler', async () => {
            const app = await startRouteTestApp()
            try {
                const response = await fetch(`${await app.getUrl()}/volume/project/project-1/project.md`)
                expect(response.status).toBe(401)
                expect(projectAccessService.assertCanRead).not.toHaveBeenCalled()
            } finally {
                await app.close()
            }
        })

        it('rejects runtime-job snapshots through the anonymous volume route', async () => {
            const app = await startRouteTestApp()
            try {
                const response = await fetch(
                    `${await app.getUrl()}/volume/runtime-jobs/job-1/.platform/inputs/source.snapshot`
                )
                expect(response.status).toBe(403)
                expect(RuntimeVolumeHandle.openExistingFile).not.toHaveBeenCalled()
            } finally {
                await app.close()
            }
        })

        it.each(['non-member', 'removed member', 'cross-tenant actor'])(
            'rejects a %s through the registered Project route',
            async () => {
                projectAccessService.assertCanRead.mockRejectedValueOnce(new ForbiddenException('project unavailable'))
                const app = await startRouteTestApp()
                try {
                    const response = await fetch(`${await app.getUrl()}/volume/project/project-1/project.md`, {
                        headers: { authorization: 'Bearer test' }
                    })
                    expect(response.status).toBe(403)
                    expect(projectAccessService.assertCanRead).toHaveBeenCalledWith('project-1')
                    expect(volumeClient.resolve).not.toHaveBeenCalled()
                } finally {
                    await app.close()
                }
            }
        )

        it.each(['project.md', 'skills/pdf/SKILL.md', 'shared/report.txt', 'agents/xpert-1/output.txt'])(
            'protects Project content through the registered route: %s',
            async (filePath) => {
                volumeClient.resolve.mockReturnValue({ serverRoot: '/missing/project-1' })
                const app = await startRouteTestApp()
                try {
                    const response = await fetch(`${await app.getUrl()}/volume/project/project-1/${filePath}`, {
                        headers: { authorization: 'Bearer test' }
                    })
                    expect(response.status).toBe(404)
                    expect(projectAccessService.assertCanRead).toHaveBeenCalledWith('project-1')
                    expect(volumeClient.resolve).toHaveBeenCalledWith({
                        tenantId: 'tenant-1',
                        catalog: 'projects',
                        projectId: 'project-1'
                    })
                } finally {
                    await app.close()
                }
            }
        )

        it('rejects a caller-selected tenant through the registered Project route', async () => {
            const app = await startRouteTestApp()
            try {
                const response = await fetch(
                    `${await app.getUrl()}/volume/project/project-1/shared/report.txt?tenant=tenant-2`,
                    { headers: { authorization: 'Bearer test' } }
                )
                expect(response.status).toBe(403)
                expect(volumeClient.resolve).not.toHaveBeenCalled()
            } finally {
                await app.close()
            }
        })

        it('ignores a matching tenant hint when resolving the registered Project route', async () => {
            volumeClient.resolve.mockReturnValue({ serverRoot: '/missing/project-1' })
            const app = await startRouteTestApp()
            try {
                const response = await fetch(
                    `${await app.getUrl()}/volume/project/project-1/shared/report.txt?tenant=tenant-1`,
                    { headers: { authorization: 'Bearer test' } }
                )
                expect(response.status).toBe(404)
                expect(volumeClient.resolve).toHaveBeenCalledWith({
                    tenantId: 'tenant-1',
                    catalog: 'projects',
                    projectId: 'project-1'
                })
            } finally {
                await app.close()
            }
        })

        it('rejects an anonymous Xpert symlink whose canonical target is Project content', async () => {
            const close = jest.fn().mockResolvedValue(undefined)
            jest.spyOn(RuntimeVolumeHandle, 'openExistingFile').mockResolvedValueOnce({
                fileHandle: { close } as never,
                filePath: '/sandbox/tenant-1/project/project-1/project.md',
                volumeRelativePath: 'project/project-1/project.md',
                descriptorPath: '/proc/self/fd/12',
                fileStat: { isFile: () => true, size: 1 } as never
            })
            const app = await startRouteTestApp()
            try {
                const response = await fetch(
                    `${await app.getUrl()}/volume/xpert/xpert-1/project-link/project.md?tenant=tenant-1`
                )
                expect(response.status).toBe(403)
                expect(close).toHaveBeenCalledTimes(1)
            } finally {
                await app.close()
            }
        })

        it('keeps the old shared Xpert URL on the anonymous compatibility route', async () => {
            const app = await startRouteTestApp()
            try {
                const response = await fetch(`${await app.getUrl()}/volume/xpert/xpert-1/report.txt?tenant=tenant-1`)
                expect(response.status).toBe(404)
                expect(projectAccessService.assertCanRead).not.toHaveBeenCalled()
                expect(RuntimeVolumeHandle.openExistingFile).toHaveBeenCalledWith(
                    '/sandbox/tenant-1',
                    'xpert/xpert-1/report.txt'
                )
            } finally {
                await app.close()
            }
        })

        async function startRouteTestApp() {
            const moduleRef = await Test.createTestingModule({
                controllers: [SandboxController],
                providers: [
                    { provide: I18nService, useValue: {} },
                    { provide: CommandBus, useValue: commandBus },
                    { provide: QueryBus, useValue: queryBus },
                    { provide: SandboxConversationContextService, useValue: sandboxConversationContextService },
                    { provide: SandboxManagedServiceService, useValue: sandboxManagedServiceService },
                    { provide: SandboxPreviewSessionService, useValue: sandboxPreviewSessionService },
                    { provide: SuperAdminOrganizationScopeService, useValue: organizationScopeService },
                    { provide: WorkspacePathMapperFactory, useValue: {} },
                    { provide: XpertProjectAccessService, useValue: projectAccessService },
                    { provide: VOLUME_CLIENT, useValue: volumeClient }
                ]
            }).compile()
            const app = moduleRef.createNestApplication()
            app.useGlobalGuards({
                canActivate(context: ExecutionContext) {
                    if (Reflect.getMetadata('isPublic', context.getHandler())) return true
                    const request = context.switchToHttp().getRequest<Request>()
                    if (request.headers.authorization) return true
                    throw new UnauthorizedException()
                }
            })
            await app.listen(0, '127.0.0.1')
            return app
        }
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

function createMissingFileResponse() {
    const response = new EventEmitter() as Response & {
        status: jest.Mock
        send: jest.Mock
    }
    response.status = jest.fn().mockReturnValue(response)
    response.send = jest.fn().mockReturnValue(response)
    return response
}

type ResponseLike = EventEmitter & {
    on(event: 'close', listener: () => void): ResponseLike
    off(event: 'close', listener: () => void): ResponseLike
}
