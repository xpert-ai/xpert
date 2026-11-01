import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { ConversationSharingController, SharedConversationController } from './share.controller'
import { ConversationSharingService } from './share.service'
import { ConversationShareManagementController } from './share-management.controller'

jest.mock('./share.service', () => ({ ConversationSharingService: class {} }))

const id = '11111111-1111-4111-8111-111111111111'
describe('sharing HTTP schema and public/private route boundary', () => {
    let app: INestApplication
    let origin: string
    const service = {
        preview: jest.fn(),
        create: jest.fn(),
        list: jest.fn(),
        revoke: jest.fn(),
        read: jest.fn(),
        listMine: jest.fn(),
        previewMine: jest.fn(),
        revokeMine: jest.fn(),
        revokeAllMine: jest.fn()
    }
    const auth = jest.fn(() => true)
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [
                ConversationSharingController,
                SharedConversationController,
                ConversationShareManagementController
            ],
            providers: [{ provide: ConversationSharingService, useValue: service }]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: auth })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        auth.mockReturnValue(true)
        service.create.mockResolvedValue({ id: 'share' })
        service.read.mockResolvedValue({ title: 'Snapshot' })
    })
    afterAll(() => app.close())
    const post = (body: unknown) =>
        fetch(`${origin}/conversations/${id}/shares`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('keeps every management endpoint behind authentication', async () => {
        auth.mockReturnValue(false)
        expect((await post({ threadId: 'thread', digest: 'a'.repeat(64) })).status).toBe(403)
        expect((await fetch(`${origin}/conversations/${id}/shares`)).status).toBe(403)
        expect((await fetch(`${origin}/conversations/${id}/shares/${id}`, { method: 'DELETE' })).status).toBe(403)
        expect(service.create).not.toHaveBeenCalled()
        expect(service.list).not.toHaveBeenCalled()
        expect(service.revoke).not.toHaveBeenCalled()
        expect((await fetch(`${origin}/conversation-shares`)).status).toBe(403)
        expect((await fetch(`${origin}/conversation-shares/${id}`)).status).toBe(403)
        expect((await fetch(`${origin}/conversation-shares/${id}`, { method: 'DELETE' })).status).toBe(403)
        expect((await fetch(`${origin}/conversation-shares/revoke-all`, { method: 'POST' })).status).toBe(403)
    })

    it('defaults to organization scope and seven days, with no caller-controlled identity', async () => {
        const response = await post({ threadId: 'thread', digest: 'a'.repeat(64) })
        expect(response.status).toBe(201)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(service.create).toHaveBeenCalledWith(id, {
            threadId: 'thread',
            digest: 'a'.repeat(64),
            audience: 'organization',
            expiresInDays: 7
        })
    })
    it.each([
        { tenantId: 'forged' },
        { snapshot: { text: 'forged' } },
        { audience: 'public' },
        { expiresInDays: 0 },
        { expiresInDays: '7' },
        { audience: 'unknown' }
    ])('rejects invalid or identity-overriding input %j', async (extra) => {
        expect((await post({ threadId: 'thread', digest: 'a'.repeat(64), ...extra })).status).toBe(400)
        expect(service.create).not.toHaveBeenCalled()
    })
    it('accepts explicit public acknowledgement', async () => {
        expect(
            (await post({ threadId: 'thread', digest: 'a'.repeat(64), audience: 'public', acknowledgePublic: true }))
                .status
        ).toBe(201)
    })
    it('does not authenticate or inherit credentials on the anonymous read route', async () => {
        const response = await fetch(`${origin}/shared-conversations/token`)
        expect(response.status).toBe(200)
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
        expect(response.headers.get('referrer-policy')).toBe('no-referrer')
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(auth).not.toHaveBeenCalled()
        expect(service.read).toHaveBeenCalledWith('token', false)
        await fetch(`${origin}/shared-conversations/token/authenticated`)
        expect(auth).toHaveBeenCalledTimes(1)
        expect(service.read).toHaveBeenLastCalledWith('token', true)
    })
    it('validates preview bodies and rejects extra fields before service access', async () => {
        const response = await fetch(`${origin}/conversations/${id}/share-preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId: 'thread', organizationId: 'forged' })
        })
        expect(response.status).toBe(400)
        expect(service.preview).not.toHaveBeenCalled()
    })
    it('validates personal listing pagination, cutoff and identity overrides', async () => {
        const response = await fetch(`${origin}/conversation-shares?limit=10&offset=20&search=hello`)
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(service.listMine).toHaveBeenCalledWith({ limit: 10, offset: 20, search: 'hello' })
        for (const query of ['limit=101', 'offset=-1', 'before=invalid', 'createdById=someone', 'tenantId=other']) {
            expect((await fetch(`${origin}/conversation-shares?${query}`)).status).toBe(400)
        }
        expect(service.listMine).toHaveBeenCalledTimes(1)
    })
    it('requires an explicit bulk confirmation and a valid cutoff, and never accepts owner overrides', async () => {
        const before = new Date().toISOString()
        for (const body of [
            {},
            { before },
            { before, confirmation: 'yes' },
            { before, confirmation: 'revoke-all', createdById: 'other' }
        ]) {
            expect(
                (
                    await fetch(`${origin}/conversation-shares/revoke-all`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    })
                ).status
            ).toBe(400)
        }
        expect(service.revokeAllMine).not.toHaveBeenCalled()
        expect(
            (
                await fetch(`${origin}/conversation-shares/revoke-all`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ before, confirmation: 'revoke-all' })
                })
            ).status
        ).toBe(200)
        expect(service.revokeAllMine).toHaveBeenCalledWith({ before, confirmation: 'revoke-all' })
    })
})
