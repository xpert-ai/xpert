import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { ForbiddenException, Global, INestApplication, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector, RouterModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ApiKeyBindingType, IApiPrincipal, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext, RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { ViewExtensionService } from '@xpert-ai/server-core'
import type { Request } from 'express'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import passport, { Strategy } from 'passport'
import { RequestContextMiddleware as LegacyContextMiddleware } from '../../../server/src/core/context/request-context.middleware'
import { AuthGuard } from '../../../server/src/shared/guards/auth.guard'
import { VOLUME_CLIENT } from '../shared'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { XpertWorkspaceFilesService } from '../xpert/xpert-workspace-files.service'
import { AssistantWorkspaceFilesController } from './assistant-workspace-files.controller'
import { AssistantFileAccessGuard } from './assistant-file-access.guard'
import { WorkspaceFileAccessRuntimeController } from './workspace-file-access-runtime.controller'
import { XpertService } from '../xpert/xpert.service'
import { WorkspaceFileAccessController } from '../workspace-file-access/workspace-file-access.controller'
import { WorkspaceFileContentController } from '../workspace-file-access/workspace-file-content.controller'
import { WorkspaceFileAccessService } from '../workspace-file-access/workspace-file-access.service'

jest.mock('../xpert/xpert.service', () => ({ XpertService: class {} }))
jest.mock('../xpert-workspace/workspace.service', () => ({ XpertWorkspaceService: class {} }))
jest.mock('../xpert/xpert-workspace-files.service', () => ({ XpertWorkspaceFilesService: class {} }))

// Exercise real global/route guards, request contexts and HTTP pipes. Only
// credential verification, persistence and the View's business resources are fixtures.
describe('workspace file HTTP authentication', () => {
    let app: INestApplication
    let origin: string
    let directory: string
    const assistantId = '11111111-1111-4111-8111-111111111111'
    const otherAssistantId = '22222222-2222-4222-8222-222222222222'
    const user = { id: 'user-1', tenantId: 'tenant-1' }
    const identities = new Map<string, IUser | IApiPrincipal>()
    const values = new Map<string, unknown>()
    const workspace = { canAccess: jest.fn() }
    const files = {
        list: jest.fn(),
        read: jest.fn(),
        download: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        saveBinary: jest.fn(),
        uploadToFolder: jest.fn()
    }
    const context = () => ({
        tenantId: RequestContext.currentTenantId(),
        organizationId: RequestContext.getOrganizationId(),
        userId: RequestContext.currentUserId(),
        hostType: 'agent',
        hostId: assistantId
    })
    const manifest = { key: 'test__results', fileAccess: { purposes: ['preview', 'download'] } }
    const views = {
        resolveViewFileAccessContext: jest.fn(async () => ({ context: context(), manifest })),
        resolveViewFileResource: jest.fn(async () => ({
            context: context(),
            manifest,
            resource: {
                reference: {
                    source: 'platform.workspace.files',
                    tenantId: user.tenantId,
                    filePath: 'result.txt',
                    catalog: 'xperts',
                    scopeId: assistantId,
                    xpertId: assistantId
                },
                fileName: 'result.txt',
                mimeType: 'text/plain',
                size: 8
            }
        }))
    }

    class FixtureStrategy extends Strategy {
        constructor(readonly name: string) {
            super()
        }
        authenticate(request: Request) {
            const token = request.headers.authorization?.replace(/^Bearer /, '')
            const principal = token && identities.get(token)
            const matches =
                this.name === 'client-secret'
                    ? token?.startsWith('cs-x-')
                    : this.name === 'jwt'
                      ? token === 'fixture-jwt'
                      : false
            if (!principal || !matches) return this.fail(401)
            this.success(principal)
        }
    }

    beforeAll(async () => {
        directory = await mkdtemp(path.join(tmpdir(), 'workspace-file-http-'))
        await writeFile(path.join(directory, 'result.txt'), 'complete')
        for (const name of ['jwt', 'basic', 'oidc', 'api-key', 'client-secret']) {
            passport.use(name, new FixtureStrategy(name))
        }
        const providers = [
            AssistantFileAccessGuard,
            WorkspaceFileAccessService,
            {
                provide: CACHE_MANAGER,
                useValue: {
                    get: async (key: string) => values.get(key),
                    set: async (key: string, value: unknown) => {
                        values.set(key, value)
                    },
                    del: async (key: string) => {
                        values.delete(key)
                    }
                }
            },
            { provide: ConfigService, useValue: { get: () => 'test-only-workspace-file-secret' } },
            { provide: ViewExtensionService, useValue: views },
            {
                provide: VOLUME_CLIENT,
                useValue: { resolve: () => ({ path: () => path.join(directory, 'result.txt') }) }
            },
            { provide: XpertWorkspaceFilesService, useValue: files },
            {
                provide: XpertService,
                useValue: { findOne: async () => ({ createdById: 'owner', workspaceId: 'workspace-1' }) }
            },
            { provide: XpertWorkspaceService, useValue: workspace }
        ]
        @Global()
        @Module({
            providers,
            exports: providers.map((provider) => (typeof provider === 'function' ? provider : provider.provide))
        })
        class Dependencies {}
        @Module({ controllers: [AssistantWorkspaceFilesController, WorkspaceFileAccessRuntimeController] })
        class RuntimeApi {}
        @Module({ controllers: [WorkspaceFileAccessController, WorkspaceFileContentController] })
        class ManagementApi {}
        const module = await Test.createTestingModule({
            imports: [
                Dependencies,
                RuntimeApi,
                ManagementApi,
                RouterModule.register([
                    { path: 'ai', module: RuntimeApi },
                    { path: 'workspace-files', module: ManagementApi }
                ])
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api')
        const legacyContext = new LegacyContextMiddleware()
        const sdkContext = new RequestContextMiddleware()
        app.use(legacyContext.use.bind(legacyContext))
        app.use(sdkContext.use.bind(sdkContext))
        app.useGlobalGuards(new AuthGuard(app.get(Reflector)))
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        values.clear()
        identities.clear()
        identities.set('fixture-jwt', user)
        for (const [token, binding] of [
            ['cs-x-user', SecretTokenBindingType.USER_XPERT],
            ['cs-x-enterprise', SecretTokenBindingType.ENTERPRISE_XPERT],
            ['cs-x-public', SecretTokenBindingType.PUBLIC_XPERT],
            ['cs-x-api-key', SecretTokenBindingType.API_KEY]
        ] as const) {
            identities.set(token, {
                ...user,
                principalType: 'client_secret',
                clientSecretBindingType: binding,
                resourceScope: { kind: 'assistant', xpertId: assistantId },
                apiKey: {
                    token: '',
                    type: ApiKeyBindingType.ASSISTANT,
                    entityId: assistantId,
                    tenantId: user.tenantId,
                    organizationId: 'org-1'
                }
            })
        }
        workspace.canAccess.mockResolvedValue(true)
        files.list.mockResolvedValue([{ filePath: 'result.txt' }])
        files.read.mockResolvedValue({ content: 'complete' })
        files.download.mockImplementation(async () => ({
            type: 'file',
            fileName: 'result.txt',
            mimeType: 'text/plain',
            fileHandle: await open(path.join(directory, 'result.txt'), 'r')
        }))
    })
    afterAll(async () => {
        await app?.close()
        for (const name of ['jwt', 'basic', 'oidc', 'api-key', 'client-secret']) passport.unuse(name)
        await rm(directory, { recursive: true, force: true })
    })

    const headers = (token?: string) => ({
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'organization-id': 'org-1',
        'content-type': 'application/json'
    })
    const routes = ['files', 'file', 'file/download'] as const
    const read = (route: string, token?: string, id = assistantId) =>
        fetch(`${origin}/api/ai/assistants/${id}/workspace/${route}?path=result.txt`, { headers: headers(token) })
    const createSession = (token?: string, hostId = assistantId) =>
        fetch(`${origin}/api/ai/workspace-files/view-sessions`, {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ hostType: 'agent', hostId, viewKey: manifest.key })
        })

    it.each(routes)('supports JWT and delegated reads through %s without a 401 retry', async (route) => {
        for (const token of ['fixture-jwt', 'cs-x-user']) {
            const response = await read(route, token)
            expect(response.status).toBe(200)
            expect(await response.text()).toContain(route === 'files' ? 'result.txt' : 'complete')
        }
    })
    it('downloads a native file grant with owner JWT while retaining resource, organization and purpose checks', async () => {
        const created = await createSession('cs-x-user')
        const session: { sessionId: string } = await created.json()
        const grantResponse = await fetch(
            `${origin}/api/ai/workspace-files/view-sessions/${session.sessionId}/grants`,
            {
                method: 'POST',
                headers: headers('cs-x-user'),
                body: JSON.stringify({ fileKey: 'file-1', purpose: 'download' })
            }
        )
        const grant: { url: string } = await grantResponse.json()
        const [grantId, fileName] = new URL(grant.url).pathname.split('/').slice(-2)
        const url = `${origin}/api/workspace-files/view-sessions/${session.sessionId}/grants/${grantId}/content/${fileName}`
        const downloaded = await fetch(url, { headers: headers('fixture-jwt') })
        expect(downloaded.status).toBe(200)
        expect(await downloaded.text()).toBe('complete')
        expect(downloaded.headers.get('content-disposition')).toContain('attachment;')
        for (const token of [undefined, 'cs-x-user']) {
            const denied = await fetch(url, { headers: headers(token) })
            expect(denied.status).toBe(401)
            await denied.text()
        }
        const wrongOrg = await fetch(url, { headers: { ...headers('fixture-jwt'), 'organization-id': 'other' } })
        expect(wrongOrg.status).toBe(404)
        await wrongOrg.text()
        identities.set('fixture-jwt', { ...user, id: 'other-user' })
        const wrongOwner = await fetch(url, { headers: headers('fixture-jwt') })
        expect(wrongOwner.status).toBe(404)
        await wrongOwner.text()
        identities.set('fixture-jwt', user)
        views.resolveViewFileResource.mockRejectedValueOnce(new ForbiddenException())
        const revokedResource = await fetch(url, { headers: headers('fixture-jwt') })
        expect(revokedResource.status).toBe(403)
        await revokedResource.text()
        const previewResponse = await fetch(
            `${origin}/api/ai/workspace-files/view-sessions/${session.sessionId}/grants`,
            {
                method: 'POST',
                headers: headers('cs-x-user'),
                body: JSON.stringify({ fileKey: 'file-1', purpose: 'preview' })
            }
        )
        const preview: { url: string } = await previewResponse.json()
        const previewId = new URL(preview.url).pathname.split('/').at(-2)!
        const wrongPurpose = await fetch(url.replace(grantId, previewId), { headers: headers('fixture-jwt') })
        expect(wrongPurpose.status).toBe(404)
        await wrongPurpose.text()
        await fetch(`${origin}/api/ai/workspace-files/view-sessions/${session.sessionId}`, {
            method: 'DELETE',
            headers: headers('cs-x-user')
        })
        const revokedSession = await fetch(url, { headers: headers('fixture-jwt') })
        expect(revokedSession.status).toBe(404)
        await revokedSession.text()
    })
    it.each(routes)('rejects anonymous, invalid, wrong-Assistant and published-app access to %s', async (route) => {
        for (const [token, id, status] of [
            [undefined, assistantId, 401],
            ['cs-x-invalid', assistantId, 401],
            ['cs-x-user', otherAssistantId, 403],
            ['cs-x-enterprise', assistantId, 403],
            ['cs-x-public', assistantId, 403],
            ['cs-x-api-key', assistantId, 403]
        ] as const) {
            const response = await read(route, token, id)
            expect(response.status).toBe(status)
            await response.text()
        }
        expect(files.list).not.toHaveBeenCalled()
        expect(files.read).not.toHaveBeenCalled()
        expect(files.download).not.toHaveBeenCalled()
    })
    it.each(routes)('propagates domain authorization denial for %s', async (route) => {
        const method = route === 'files' ? 'list' : route === 'file' ? 'read' : 'download'
        files[method].mockRejectedValueOnce(new ForbiddenException())
        const response = await read(route, 'cs-x-user')
        expect(response.status).toBe(403)
        await response.text()
    })
    it.each(['fixture-jwt', 'cs-x-user', 'cs-x-enterprise'])(
        'creates, grants and revokes a cookie-bound file session with %s',
        async (token) => {
            const created = await createSession(token)
            expect(created.status).toBe(201)
            const session: { sessionId: string } = await created.json()
            const cookie = created.headers.get('set-cookie')!
            expect(cookie).toContain('HttpOnly')
            expect(cookie).toContain(`Path=/api/workspace-files/content/${session.sessionId}`)
            const grantResponse = await fetch(
                `${origin}/api/ai/workspace-files/view-sessions/${session.sessionId}/grants`,
                {
                    method: 'POST',
                    headers: headers(token),
                    body: JSON.stringify({ fileKey: 'file-1', purpose: 'download' })
                }
            )
            expect(grantResponse.status).toBe(201)
            const grant: { url: string } = await grantResponse.json()
            const contentPath = new URL(grant.url).pathname
            for (const method of ['GET', 'HEAD']) {
                const noCookie = await fetch(`${origin}${contentPath}`, { method, headers: headers(token) })
                expect(noCookie.status).toBe(401)
                await noCookie.text()
            }
            const content = await fetch(`${origin}${contentPath}`, { headers: { cookie: cookie.split(';')[0] } })
            expect(content.status).toBe(200)
            expect(await content.text()).toBe('complete')
            expect(content.headers.get('content-disposition')).toContain('attachment;')
            const cookieHeaders = { cookie: cookie.split(';')[0] }
            const head = await fetch(`${origin}${contentPath}`, { method: 'HEAD', headers: cookieHeaders })
            expect(head.status).toBe(200)
            expect(head.headers.get('content-length')).toBe('8')
            expect(head.headers.get('accept-ranges')).toBe('bytes')
            expect(await head.text()).toBe('')
            const partial = await fetch(`${origin}${contentPath}`, {
                headers: { ...cookieHeaders, range: 'bytes=1-3' }
            })
            expect(partial.status).toBe(206)
            expect(partial.headers.get('content-range')).toBe('bytes 1-3/8')
            expect(await partial.text()).toBe('omp')
            const outside = await fetch(`${origin}${contentPath}`, {
                headers: { ...cookieHeaders, range: 'bytes=20-30' }
            })
            expect(outside.status).toBe(416)
            expect(outside.headers.get('content-range')).toBe('bytes */8')
            await outside.text()
            const revoked = await fetch(`${origin}/api/ai/workspace-files/view-sessions/${session.sessionId}`, {
                method: 'DELETE',
                headers: headers(token)
            })
            expect(revoked.status).toBe(200)
            await revoked.text()
            for (const method of ['GET', 'HEAD']) {
                const expired = await fetch(`${origin}${contentPath}`, { method, headers: cookieHeaders })
                expect(expired.status).toBe(401)
                await expired.text()
            }
        }
    )
    it('rejects unauthenticated, public and mismatched file session management before resolving a View', async () => {
        for (const [token, id, status] of [
            [undefined, assistantId, 401],
            ['cs-x-invalid', assistantId, 401],
            ['cs-x-user', otherAssistantId, 403],
            ['cs-x-public', assistantId, 403],
            ['cs-x-api-key', assistantId, 403]
        ] as const) {
            const response = await createSession(token, id)
            expect(response.status).toBe(status)
            await response.text()
        }
        expect(views.resolveViewFileAccessContext).not.toHaveBeenCalled()
    })
    it('keeps DTO validation active on the delegated session entry point', async () => {
        const response = await fetch(`${origin}/api/ai/workspace-files/view-sessions`, {
            method: 'POST',
            headers: headers('cs-x-user'),
            body: JSON.stringify({ hostType: 'agent', hostId: assistantId })
        })
        expect(response.status).toBe(400)
        await response.text()
        expect(views.resolveViewFileAccessContext).not.toHaveBeenCalled()
    })
    it('keeps management file-session routes protected by login authentication', async () => {
        for (const token of ['cs-x-user', 'cs-x-enterprise', 'fixture-jwt']) {
            const response = await fetch(`${origin}/api/workspace-files/view-sessions`, {
                method: 'POST',
                headers: headers(token),
                body: JSON.stringify({ hostType: 'agent', hostId: assistantId, viewKey: manifest.key })
            })
            expect(response.status).toBe(token === 'fixture-jwt' ? 201 : 401)
            await response.text()
        }
    })
    it('checks the stored Assistant binding for grants and revocation', async () => {
        const created = await createSession('cs-x-user')
        const session: { sessionId: string } = await created.json()
        const principal = identities.get('cs-x-user')!
        if (!('apiKey' in principal)) throw new Error('Missing test principal')
        identities.set('cs-x-other', { ...principal, resourceScope: { kind: 'assistant', xpertId: otherAssistantId } })
        for (const method of ['POST', 'DELETE']) {
            const response = await fetch(
                `${origin}/api/ai/workspace-files/view-sessions/${session.sessionId}${method === 'POST' ? '/grants' : ''}`,
                {
                    method,
                    headers: headers('cs-x-other'),
                    ...(method === 'POST' ? { body: JSON.stringify({ fileKey: 'file-1', purpose: 'download' }) } : {})
                }
            )
            expect(response.status).toBe(403)
            await response.text()
        }
        expect(views.resolveViewFileResource).not.toHaveBeenCalled()
    })
    it('coerces list depth, defaults the root path and rejects extra or invalid query fields', async () => {
        const url = `${origin}/api/ai/assistants/${assistantId}/workspace/files`
        const valid = await fetch(`${url}?deepth=2`, { headers: headers('cs-x-user') })
        expect(valid.status).toBe(200)
        await valid.text()
        expect(files.list).toHaveBeenCalledWith(assistantId, '', 2)
        files.list.mockClear()
        for (const query of ['deepth=-1', 'deepth=oops', 'tenantId=another', 'path=a&path=b']) {
            const response = await fetch(`${url}?${query}`, { headers: headers('cs-x-user') })
            expect(response.status).toBe(400)
            await response.text()
        }
        expect(files.list).not.toHaveBeenCalled()
    })
    it('validates writes and scopes deletion before calling the file service', async () => {
        const url = `${origin}/api/ai/assistants/${assistantId}/workspace/file`
        const saved = await fetch(url, {
            method: 'PUT',
            headers: headers('cs-x-user'),
            body: JSON.stringify({ path: 'result.txt', content: 'new' })
        })
        expect(saved.status).toBe(200)
        await saved.text()
        expect(files.save).toHaveBeenCalledWith(assistantId, 'result.txt', 'new')
        const deleted = await fetch(`${url}?path=result.txt`, { method: 'DELETE', headers: headers('cs-x-user') })
        expect(deleted.status).toBe(200)
        await deleted.text()
        expect(files.delete).toHaveBeenCalledWith(assistantId, 'result.txt')
        files.save.mockClear()
        for (const body of [
            { path: '', content: 'bad' },
            { path: 'result.txt' },
            { path: 'result.txt', content: 'bad', tenantId: 'other' }
        ]) {
            const response = await fetch(url, {
                method: 'PUT',
                headers: headers('cs-x-user'),
                body: JSON.stringify(body)
            })
            expect(response.status).toBe(400)
            await response.text()
        }
        const denied = await fetch(url, {
            method: 'PUT',
            headers: headers('cs-x-enterprise'),
            body: JSON.stringify({ path: 'result.txt', content: 'bad' })
        })
        expect(denied.status).toBe(403)
        await denied.text()
        expect(files.save).not.toHaveBeenCalled()
    })
    it.each(['upload', 'save-binary'])('validates multipart %s and forwards exact bytes', async (route) => {
        const url = `${origin}/api/ai/assistants/${assistantId}/workspace/file/${route}`
        const { 'content-type': contentType, ...auth } = headers('cs-x-user')
        const missing = await fetch(url, { method: 'POST', headers: auth, body: new FormData() })
        expect(missing.status).toBe(400)
        await missing.text()
        const body = new FormData()
        body.append('path', 'results/file.bin')
        body.append('file', new Blob([new Uint8Array([0, 1, 255])]), 'file.bin')
        const response = await fetch(url, { method: 'POST', headers: auth, body })
        expect(response.status).toBe(201)
        await response.text()
        if (route === 'save-binary') {
            expect(files.saveBinary).toHaveBeenCalledWith(assistantId, 'results/file.bin', Buffer.from([0, 1, 255]))
        } else {
            expect(files.uploadToFolder).toHaveBeenCalledWith(
                assistantId,
                'results/file.bin',
                expect.objectContaining({ buffer: Buffer.from([0, 1, 255]) })
            )
        }
    })
})
