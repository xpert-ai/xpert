import { ForbiddenException, NotFoundException, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/server-core'
import { WorkspaceFilesRuntimeCapabilityService } from '../shared/runtime/workspace-files-runtime-capability.service'
import { McpFilesController, McpFilesGuard } from './mcp-files.controller'
import { McpFilesService, MCP_FILE_MAX_BYTES } from './mcp-files.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpAuthenticationService } from './mcp-authentication.service'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'
import { McpRateLimitService } from './mcp-rate-limit.service'

describe('MCP binary files HTTP boundary', () => {
    let app: INestApplication
    let baseUrl: string
    let reportedSize: number | undefined
    const stored = new Map<string, Buffer>()
    const publication = { id: 'pub-1', tenantId: 'tenant-1', slug: 'cut', runtime: { files: { type: 'user' } } }
    const authenticate = jest.fn()
    const authorize = jest.fn()
    const createScopedApi = jest.fn()

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [McpFilesController],
            providers: [
                McpFilesService,
                McpFilesGuard,
                { provide: McpPublicationService, useValue: { findActiveBySlug: async () => publication } },
                { provide: McpAuthenticationService, useValue: { authenticate } },
                { provide: McpPublicationAuthorizationService, useValue: { assertCanRun: authorize } },
                { provide: McpRateLimitService, useValue: { assertWithinLimit: jest.fn() } },
                { provide: WorkspaceFilesRuntimeCapabilityService, useValue: { createScopedApi } }
            ]
        }).compile()
        app = module.createNestApplication()
        app.setGlobalPrefix('api')
        await app.listen(0, '127.0.0.1')
        baseUrl = await app.getUrl()
    })
    afterAll(() => app.close())
    beforeEach(() => {
        jest.clearAllMocks()
        stored.clear()
        reportedSize = undefined
        publication.runtime = { files: { type: 'user' } }
        authenticate.mockResolvedValue(principal('alice'))
        authorize.mockImplementation(async (_publication, actor) => ({ id: actor.userId, tenantId: 'tenant-1' }))
        createScopedApi.mockImplementation((scope: { userId: string }) => {
            expect(RequestContext.currentUserId()).toBe(scope.userId)
            return {
                writeRuntimeBuffer: async (input: {
                    buffer: Buffer
                    folder: string
                    fileName: string
                    mimeType: string
                }) => {
                    const filePath = `${input.folder}/${input.fileName}`
                    stored.set(`${scope.userId}:${filePath}`, input.buffer)
                    return {
                        size: input.buffer.length,
                        mimeType: input.mimeType,
                        reference: {
                            source: 'platform.workspace.files',
                            tenantId: 'tenant-1',
                            userId: scope.userId,
                            catalog: 'users',
                            scopeId: scope.userId,
                            filePath
                        }
                    }
                },
                resolveRuntimeReference: async (input: { filePath: string }) => input,
                resolveFile: async ({ filePath }: { filePath: string }) => {
                    const bytes = stored.get(`${scope.userId}:${filePath}`)
                    if (!bytes) throw new NotFoundException()
                    return { size: reportedSize ?? bytes.length }
                },
                readRuntimeBuffer: async ({ filePath }: { filePath: string }) => ({
                    name: 'video.mp4',
                    buffer: stored.get(`${scope.userId}:${filePath}`)
                })
            }
        })
    })

    async function upload(bytes = Buffer.from('video'), fields?: Record<string, string>) {
        const form = new FormData()
        for (const [key, value] of Object.entries(fields ?? {})) form.append(key, value)
        form.append('file', new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), 'video.mp4')
        return fetch(`${baseUrl}/api/mcp/p/cut/files`, { method: 'POST', body: form })
    }

    it('round trips bytes under the authenticated user without sending binary data through MCP JSON', async () => {
        const bytes = Buffer.from([0, 255, 5, 10, 99])
        const response = await upload(bytes)
        expect(response.status).toBe(201)
        const uploaded = await response.json()
        expect(uploaded.reference).toMatchObject({ catalog: 'users', scopeId: 'alice', userId: 'alice' })
        expect(uploaded).not.toHaveProperty('buffer')
        const downloaded = await fetch(`${baseUrl}${uploaded.downloadPath}`)
        expect(downloaded.status).toBe(200)
        expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(bytes)
        expect(downloaded.headers.get('cache-control')).toBe('no-store')
        expect(createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant-1', userId: 'alice', catalog: 'users', scopeId: 'alice' })
        )
    })

    it('cannot read another user file by replaying its relative path', async () => {
        const uploaded = await (await upload()).json()
        authenticate.mockResolvedValue(principal('bob'))
        const response = await fetch(`${baseUrl}${uploaded.downloadPath}`)
        expect(response.status).toBe(404)
    })

    it('rejects unauthorized requests before the multipart interceptor processes their body', async () => {
        authorize.mockRejectedValueOnce(new ForbiddenException())
        expect((await upload(undefined, { unexpected: 'invalid multipart body' })).status).toBe(403)
        expect(createScopedApi).not.toHaveBeenCalled()
    })

    it.each([
        { ...principal('alice'), scopes: ['tools:call'] },
        { ...principal('alice'), subjectType: 'service_account' }
    ])('requires user identity and dedicated file scopes', async (actor) => {
        authenticate.mockResolvedValueOnce(actor)
        expect((await upload()).status).toBe(403)
        expect(createScopedApi).not.toHaveBeenCalled()
    })

    it('does not enable files for a publication without an explicit binding', async () => {
        Reflect.deleteProperty(publication.runtime, 'files')
        expect((await fetch(`${baseUrl}/api/mcp/p/cut/files?filePath=video.mp4`)).status).toBe(403)
    })

    it('rejects empty input and oversized persisted output before reading its bytes', async () => {
        expect((await upload(Buffer.alloc(0))).status).toBe(400)
        const uploaded = await (await upload()).json()
        reportedSize = MCP_FILE_MAX_BYTES + 1
        expect((await fetch(`${baseUrl}${uploaded.downloadPath}`)).status).toBe(413)
    })

    it('rejects absolute paths and multipart scope injection', async () => {
        expect((await fetch(`${baseUrl}/api/mcp/p/cut/files?filePath=%2Fetc%2Fpasswd`)).status).toBe(400)
        expect((await upload(undefined, { userId: 'bob' })).status).toBe(400)
        expect(createScopedApi).not.toHaveBeenCalled()
    })
})

function principal(userId: string) {
    return {
        subjectType: 'user',
        subjectId: userId,
        userId,
        publicationId: 'pub-1',
        tenantId: 'tenant-1',
        scopes: ['files:read', 'files:write']
    }
}
