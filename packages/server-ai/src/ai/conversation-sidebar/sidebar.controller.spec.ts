import { ForbiddenException, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from '../public-xpert-principal'
import { ChatConversationSidebarService } from '../../chat-conversation/conversation-sidebar.service'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { ConversationSidebarController } from './sidebar.controller'

jest.mock('../public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn(),
    getPublicXpertSessionConversationScope: jest.fn()
}))

const assistantId = '66d1b8ed-e8fc-4df0-a30a-717d291cdd21'
const id = '113f77ac-bf30-4d83-8b7a-4f10da01eb8a'

describe('SDK personal conversation sidebar HTTP boundary', () => {
    let app: INestApplication
    let baseUrl: string
    const sidebar = { list: jest.fn(), read: jest.fn(), update: jest.fn() }
    const conversations = { assertAccess: jest.fn() }
    const published = { getAccessiblePublishedXpertFamilyIds: jest.fn(), getAccessiblePublishedXpert: jest.fn() }
    const send = (path: string, method = 'GET', body?: unknown) =>
        fetch(`${baseUrl}/conversations/${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        })
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ConversationSidebarController],
            providers: [
                { provide: ChatConversationSidebarService, useValue: sidebar },
                { provide: ChatConversationService, useValue: conversations },
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: QueryBus, useValue: { execute: jest.fn() } }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        baseUrl = await app.getUrl()
    })
    afterAll(() => app?.close())
    beforeEach(() => {
        jest.clearAllMocks()
        jest.mocked(getPublicXpertSessionConversationScope).mockReturnValue(null)
        jest.mocked(assertPublicXpertSessionConversationAccess).mockResolvedValue(undefined)
        published.getAccessiblePublishedXpertFamilyIds.mockResolvedValue([assistantId])
        published.getAccessiblePublishedXpert.mockResolvedValue({ id: assistantId })
        conversations.assertAccess.mockResolvedValue({ id, xpertId: assistantId })
        sidebar.list.mockResolvedValue({
            items: [{ id, threadId: id, sidebar: { pinned: true, archived: false } }],
            total: 1
        })
        sidebar.read.mockResolvedValue({ pinned: false, archived: false })
        sidebar.update.mockResolvedValue({ pinned: false, archived: true })
    })

    it('validates search and preserves DTO sidebar state, project null and defaults', async () => {
        const response = await send('sidebar/search', 'POST', { assistantId, projectId: null, search: ' title ' })
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            items: [{ sidebar: { pinned: true, archived: false } }],
            total: 1
        })
        expect(sidebar.list).toHaveBeenCalledWith([assistantId], 50, 0, false, 'title', null, undefined)
    })
    it.each([
        {},
        { assistantId, archived: 'true' },
        { assistantId, unknown: true },
        { assistantId, limit: 101 },
        { assistantId, offset: -1 },
        { assistantId, projectId: 'bad' },
        { assistantId, search: 'a'.repeat(201) }
    ])('rejects malformed search bodies before service dispatch: %j', async (body) => {
        expect((await send('sidebar/search', 'POST', body)).status).toBe(400)
        expect(sidebar.list).not.toHaveBeenCalled()
    })
    it.each([{}, { pinned: 1 }, { archived: null }, { options: {} }, { pinned: true, ownerId: id }])(
        'rejects malformed patches before service dispatch: %j',
        async (body) => {
            expect((await send(`${id}/sidebar`, 'PATCH', body)).status).toBe(400)
            expect(sidebar.update).not.toHaveBeenCalled()
        }
    )
    it('authorizes reads and preserves explicit false values in partial updates', async () => {
        expect((await send(`${id}/sidebar`)).status).toBe(200)
        expect((await send(`${id}/sidebar`, 'PATCH', { pinned: false })).status).toBe(200)
        expect(sidebar.update).toHaveBeenCalledWith(id, { pinned: false })
        expect(assertPublicXpertSessionConversationAccess).toHaveBeenCalledWith(
            { id, xpertId: assistantId },
            expect.anything()
        )
    })
    it('does not read or change preferences outside the credential Assistant audience', async () => {
        jest.mocked(assertPublicXpertSessionConversationAccess).mockRejectedValueOnce(new ForbiddenException())
        expect((await send(`${id}/sidebar`, 'PATCH', { archived: true })).status).toBe(403)
        expect(sidebar.update).not.toHaveBeenCalled()
        published.getAccessiblePublishedXpertFamilyIds.mockRejectedValueOnce(new ForbiddenException())
        expect((await send('sidebar/search', 'POST', { assistantId })).status).toBe(403)
        expect(sidebar.list).not.toHaveBeenCalled()
    })
    it('declares personal preferences unavailable to service sessions without changing their data', async () => {
        jest.mocked(getPublicXpertSessionConversationScope).mockReturnValue({
            xpertId: assistantId,
            createdById: 'technical-user'
        })
        expect((await send('sidebar/search', 'POST', { assistantId })).status).toBe(501)
        expect((await send(`${id}/sidebar`, 'PATCH', { pinned: true })).status).toBe(501)
        expect(sidebar.update).not.toHaveBeenCalled()
    })
    it('preserves read-only history from an owned Assistant technical account', async () => {
        const actor = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
        published.getAccessiblePublishedXpert.mockResolvedValueOnce({
            id: assistantId,
            createdById: 'owner',
            userId: 'technical-user'
        })
        expect((await send('sidebar/search', 'POST', { assistantId })).status).toBe(200)
        expect(sidebar.list).toHaveBeenCalledWith([assistantId], 50, 0, false, '', undefined, 'technical-user')
        actor.mockRestore()
    })
})
