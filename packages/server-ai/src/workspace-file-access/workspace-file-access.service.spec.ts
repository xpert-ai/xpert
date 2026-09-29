import { RequestContext } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { ForbiddenException } from '@nestjs/common'
import type { Request } from 'express'
import { WorkspaceFileAccessService } from './workspace-file-access.service'

describe('WorkspaceFileAccessService', () => {
    const context = {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'assistant-1'
    }
    const manifest = {
        key: 'cut__workbench',
        fileAccess: { purposes: ['preview'] }
    }

    beforeEach(() => {
        jest.replaceProperty(environment, 'baseUrl', 'http://localhost:3000')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(context.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(context.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(context.userId)
    })

    afterEach(() => jest.restoreAllMocks())

    function createService() {
        const values = new Map<string, unknown>()
        const cache = {
            get: jest.fn(async (key: string) => values.get(key)),
            set: jest.fn(async (key: string, value: unknown) => {
                values.set(key, value)
            }),
            del: jest.fn(async (key: string) => {
                values.delete(key)
            })
        }
        const viewExtensions = {
            resolveViewFileAccessContext: jest.fn(async () => ({ context, manifest })),
            resolveViewFileResource: jest.fn(async () => ({
                context,
                manifest,
                resource: {
                    reference: {
                        source: 'platform.workspace.files',
                        filePath: '/tenant-1/xperts/assistant-1/files/video.mp4',
                        tenantId: 'tenant-1',
                        userId: 'user-1',
                        catalog: 'xperts',
                        scopeId: 'assistant-1',
                        xpertId: 'assistant-1'
                    },
                    fileName: '../video.mp4',
                    mimeType: 'video/mp4',
                    size: 4096
                }
            }))
        }
        const service = new WorkspaceFileAccessService(
            cache as never,
            { get: jest.fn(() => 'workspace-file-access-test-secret') } as never,
            viewExtensions as never,
            { resolve: jest.fn() } as never
        )
        return { service, cache, viewExtensions }
    }

    it('creates an HttpOnly scoped session and an opaque grant that can be authorized', async () => {
        const { service, cache, viewExtensions } = createService()
        const session = await service.createSession(
            { hostType: 'agent', hostId: 'assistant-1', viewKey: 'cut__workbench' },
            { headers: { origin: 'http://localhost:4300' }, secure: false }
        )

        expect(session.cookie).toMatchObject({
            name: 'xpert_workspace_file_access',
            options: {
                httpOnly: true,
                sameSite: 'lax',
                secure: false,
                path: `/api/workspace-files/content/${session.sessionId}`
            }
        })
        const grant = await service.createGrant(session.sessionId, {
            fileKey: 'asset-1',
            targetId: 'project-1',
            purpose: 'preview'
        })
        const url = new URL(grant.url)
        const segments = url.pathname.split('/')
        const grantId = segments.at(-2)!

        expect(grant).toMatchObject({ fileName: 'video.mp4', mimeType: 'video/mp4', size: 4096 })
        expect(grant.url).not.toContain('tenant-1')
        expect(grant.url).not.toContain('assistant-1')
        expect(grant.url).not.toContain('asset-1')
        await expect(
            service.authorizeContent(session.sessionId, grantId, 'video.mp4', session.cookie.value)
        ).resolves.toMatchObject({ grant: { fileKey: 'asset-1', targetId: 'project-1', purpose: 'preview' } })
        await expect(
            service.authorizeContent(session.sessionId, grantId, 'other.mp4', session.cookie.value)
        ).rejects.toMatchObject({ status: 404 })
        const authorization = await service.authorizeContent(
            session.sessionId,
            grantId,
            'video.mp4',
            session.cookie.value
        )
        expect(
            service.assertRequestOrigin(authorization.session, { headers: { origin: 'http://localhost:4300' } })
        ).toBe('http://localhost:4300')
        expect(() =>
            service.assertRequestOrigin(authorization.session, { headers: { origin: 'https://attacker.example' } })
        ).toThrow()
        expect(
            service.assertRequestOrigin(authorization.session, {
                headers: { referer: 'http://localhost:3000/api/xpert-view/entry' }
            })
        ).toBe('http://localhost:3000')
        expect(
            service.assertRequestOrigin(
                authorization.session,
                {
                    headers: {
                        'sec-fetch-site': 'same-site',
                        'sec-fetch-mode': 'no-cors',
                        'sec-fetch-dest': 'image'
                    }
                },
                'preview'
            )
        ).toBeNull()
        expect(
            service.assertRequestOrigin(
                authorization.session,
                {
                    headers: {
                        'sec-fetch-site': 'same-origin',
                        'sec-fetch-mode': 'no-cors',
                        'sec-fetch-dest': 'image'
                    }
                },
                'preview'
            )
        ).toBeNull()
        expect(() =>
            service.assertRequestOrigin(
                authorization.session,
                {
                    headers: {
                        'sec-fetch-site': 'cross-site',
                        'sec-fetch-mode': 'no-cors',
                        'sec-fetch-dest': 'image'
                    }
                },
                'preview'
            )
        ).toThrow()
        expect(service.assertRequestOrigin(authorization.session, { headers: {} }, 'download')).toBeNull()
        expect(() => service.assertRequestOrigin(authorization.session, { headers: {} }, 'preview')).toThrow()
        expect(cache.set).toHaveBeenCalledTimes(2)
        expect(viewExtensions.resolveViewFileResource).toHaveBeenCalledWith(
            'agent',
            'assistant-1',
            'cut__workbench',
            {
                fileKey: 'asset-1',
                targetId: 'project-1',
                purpose: 'preview'
            },
            { runtimeScope: { projectId: null, conversationId: null } }
        )
    })

    describe('same-origin iframe fetch previews', () => {
        const fetchHeaders = {
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty'
        }

        async function createPreviewAuthorization() {
            const { service } = createService()
            const session = await service.createSession(
                { hostType: 'agent', hostId: 'assistant-1', viewKey: 'cut__workbench' },
                { headers: { origin: 'http://localhost:4300' }, secure: false }
            )
            const grant = await service.createGrant(session.sessionId, { fileKey: 'asset-1', purpose: 'preview' })
            const grantId = new URL(grant.url).pathname.split('/').at(-2)!
            const authorization = await service.authorizeContent(
                session.sessionId,
                grantId,
                grant.fileName,
                session.cookie.value
            )
            return { service, session, grant, grantId, authorization }
        }

        it('accepts a cookie-authorized blob iframe fetch without Origin or Referer', async () => {
            const { service, authorization } = await createPreviewAuthorization()

            expect(
                service.assertRequestOrigin(
                    authorization.session,
                    { headers: fetchHeaders },
                    authorization.grant.purpose
                )
            ).toBeNull()
        })

        const rejectedHeaders: Array<[string, Request['headers']]> = [
            ['same-site fetch', { ...fetchHeaders, 'sec-fetch-site': 'same-site' }],
            ['cross-site fetch', { ...fetchHeaders, 'sec-fetch-site': 'cross-site' }],
            ['navigation without a site', { ...fetchHeaders, 'sec-fetch-site': 'none' }],
            ['missing fetch site', { ...fetchHeaders, 'sec-fetch-site': undefined }],
            ['missing fetch mode', { ...fetchHeaders, 'sec-fetch-mode': undefined }],
            ['missing fetch destination', { ...fetchHeaders, 'sec-fetch-dest': undefined }],
            ['no-cors fetch', { ...fetchHeaders, 'sec-fetch-mode': 'no-cors' }],
            ['document navigation', { ...fetchHeaders, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }],
            ['foreign Origin', { ...fetchHeaders, origin: 'https://attacker.example' }],
            ['foreign Referer', { ...fetchHeaders, referer: 'https://attacker.example/document' }],
            ['opaque Origin', { ...fetchHeaders, origin: 'null' }],
            ['malformed Origin', { ...fetchHeaders, origin: 'invalid-origin' }],
            ['malformed Referer', { ...fetchHeaders, referer: 'invalid-referer' }],
            ['no fetch metadata', {}]
        ]

        it.each(rejectedHeaders)('rejects %s even with a valid session and grant', async (_label, headers) => {
            const { service, authorization } = await createPreviewAuthorization()

            expect(() =>
                service.assertRequestOrigin(authorization.session, { headers }, authorization.grant.purpose)
            ).toThrow(ForbiddenException)
        })

        it('still requires a valid cookie and an active grant before checking fetch metadata', async () => {
            const { service, session, grant, grantId } = await createPreviewAuthorization()

            await expect(
                service.authorizeContent(session.sessionId, grantId, grant.fileName, 'invalid-cookie')
            ).rejects.toMatchObject({ status: 401 })
            await expect(
                service.authorizeContent(session.sessionId, 'missing-grant', grant.fileName, session.cookie.value)
            ).rejects.toMatchObject({ status: 404 })
            await service.revokeSession(session.sessionId)
            await expect(
                service.authorizeContent(session.sessionId, grantId, grant.fileName, session.cookie.value)
            ).rejects.toMatchObject({ status: 401 })
        })
    })

    it('does not allow a session to be reused across users or organizations', async () => {
        const { service, viewExtensions } = createService()
        const session = await service.createSession(
            { hostType: 'agent', hostId: 'assistant-1', viewKey: 'cut__workbench' },
            { headers: {}, secure: true }
        )

        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-2')
        await expect(
            service.createGrant(session.sessionId, { fileKey: 'asset-1', purpose: 'preview' })
        ).rejects.toMatchObject({ status: 404 })
        expect(viewExtensions.resolveViewFileResource).not.toHaveBeenCalled()
    })

    it('does not allow a session to be reused across Project data scopes', async () => {
        const { service, viewExtensions } = createService()
        viewExtensions.resolveViewFileAccessContext.mockResolvedValueOnce({
            context: {
                ...context,
                runtimeScope: {
                    projectId: 'project-1',
                    conversationId: null,
                    dataScopeKey: 'project:project-1'
                }
            },
            manifest
        } as never)
        const session = await service.createSession(
            {
                hostType: 'agent',
                hostId: 'assistant-1',
                viewKey: 'cut__workbench',
                runtimeScope: { projectId: 'project-1' }
            },
            { headers: {}, secure: true }
        )
        viewExtensions.resolveViewFileResource.mockResolvedValueOnce({
            context: {
                ...context,
                runtimeScope: {
                    projectId: 'project-2',
                    conversationId: null,
                    dataScopeKey: 'project:project-2'
                }
            },
            manifest,
            resource: {
                reference: {
                    source: 'platform.workspace.files',
                    filePath: '/tenant-1/projects/project-2/video.mp4',
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    catalog: 'projects',
                    scopeId: 'project-2',
                    projectId: 'project-2'
                },
                fileName: 'video.mp4',
                mimeType: 'video/mp4',
                size: 4096
            }
        } as never)

        await expect(
            service.createGrant(session.sessionId, { fileKey: 'asset-1', purpose: 'preview' })
        ).rejects.toMatchObject({ status: 404 })
    })

    it('rejects provider resources outside the session tenant', async () => {
        const { service, viewExtensions } = createService()
        const session = await service.createSession(
            { hostType: 'agent', hostId: 'assistant-1', viewKey: 'cut__workbench' },
            { headers: {}, secure: true }
        )
        viewExtensions.resolveViewFileResource.mockResolvedValueOnce({
            context,
            manifest,
            resource: {
                reference: {
                    source: 'platform.workspace.files',
                    filePath: '/tenant-2/video.mp4',
                    tenantId: 'tenant-2',
                    userId: 'user-1',
                    catalog: 'xperts',
                    scopeId: 'assistant-1',
                    xpertId: 'assistant-1'
                },
                fileName: 'video.mp4',
                mimeType: 'video/mp4',
                size: 4096
            }
        })

        await expect(
            service.createGrant(session.sessionId, { fileKey: 'asset-1', purpose: 'preview' })
        ).rejects.toMatchObject({ status: 400 })
    })
})
