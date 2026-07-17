import { RequestContext } from '@xpert-ai/server-core'
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
        expect(cache.set).toHaveBeenCalledTimes(2)
        expect(viewExtensions.resolveViewFileResource).toHaveBeenCalledWith('agent', 'assistant-1', 'cut__workbench', {
            fileKey: 'asset-1',
            targetId: 'project-1',
            purpose: 'preview'
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
