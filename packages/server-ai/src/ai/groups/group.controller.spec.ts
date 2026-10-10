import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { GroupRuntimeViewService } from '../../chat-group/group-runtime-view.service'
import { GroupCatalogService } from '../../chat-group/group-catalog.service'
import { GroupInteractionsService } from '../../chat-group/group-interactions.service'
import { GroupControlService } from '../../chat-group/group-control.service'
import { INestApplication, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { init } from 'i18next'
import { GroupsController } from './group.controller'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupMembersService } from '../../chat-group/group-members.service'
import { GroupMessagesService } from '../../chat-group/group-messages.service'
import { GroupOutboxService } from '../../chat-group/group-outbox.service'
import { GroupStreamService } from '../../chat-group/group-stream.service'

const id = '11111111-1111-4111-8111-111111111111'
describe('group HTTP boundary', () => {
    const messages = { submit: jest.fn(), snapshot: jest.fn(), preferences: jest.fn() }
    const outbox = { flush: jest.fn() }
    const interactions = { claim: jest.fn(), respond: jest.fn() }
    let app: INestApplication
    let origin: string
    beforeAll(async () => {
        await init({
            lng: 'en',
            resources: { en: { 'server-ai': { Error: { GroupInputInvalid: 'Invalid group input' } } } }
        })
        const module = await Test.createTestingModule({
            controllers: [GroupsController],
            providers: [
                { provide: GroupRuntimeViewService, useValue: {} },
                { provide: GroupCatalogService, useValue: {} },
                { provide: GroupInteractionsService, useValue: interactions },
                { provide: GroupMessagesService, useValue: messages },
                { provide: GroupMembersService, useValue: {} },
                { provide: GroupOutboxService, useValue: outbox },
                { provide: GroupStreamService, useValue: {} },
                { provide: GroupControlService, useValue: {} }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(GroupScopeGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    beforeEach(() => {
        jest.clearAllMocks()
        messages.submit.mockResolvedValue({ id })
        messages.snapshot.mockResolvedValue({ id })
    })
    const post = (input: unknown) =>
        fetch(`${origin}/groups/${id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        })
    it('accepts steer-only group requests without accepting execution controls', async () => {
        expect((await post({ clientMessageId: id, text: ' hello ' })).status).toBe(201)
        expect(messages.submit).toHaveBeenCalledWith(id, {
            clientMessageId: id,
            text: ' hello '
        })
        expect(outbox.flush).toHaveBeenCalledWith(id)
    })
    it.each([
        { mode: 'queue' },
        { senderId: id },
        { tenantId: id },
        { runtimePrincipal: { type: 'assistant' } },
        { recipientIds: [] },
        { recipientIds: [id, id] },
        { mentions: [{ participantId: id, start: -1, end: 3 }] },
        { text: ' ' }
    ])('rejects invalid controls or spoofed provenance %j', async (override) => {
        const response = await post({
            clientMessageId: id,
            text: 'hello',
            ...override
        })
        expect(response.status).toBe(400)
        expect((await response.json()).message).toBe('Invalid group input')
        expect(messages.submit).not.toHaveBeenCalled()
    })
    it('derives reply recipients exclusively at the server', async () => {
        expect((await post({ replyToMessageId: id, clientMessageId: id, text: 'answer' })).status).toBe(201)
        expect(
            (
                await post({
                    intent: 'reply',
                    replyToMessageId: id,
                    recipientIds: [id],
                    clientMessageId: id,
                    text: 'answer'
                })
            ).status
        ).toBe(400)
    })
    it('coerces pagination and rejects arbitrary fields', async () => {
        expect((await fetch(`${origin}/groups/${id}?before=10&limit=3`)).status).toBe(200)
        expect(messages.snapshot).toHaveBeenCalledWith(id, 10, 3)
        expect((await fetch(`${origin}/groups/${id}?limit=1000`)).status).toBe(400)
        expect((await fetch(`${origin}/groups/${id}?userId=${id}`)).status).toBe(400)
    })
    it.each(['claim', 'respond'] as const)(
        'validates the %s interaction route before calling the service',
        async (action) => {
            const send = (body: unknown) =>
                fetch(`${origin}/groups/${id}/interactions/${id}/${action}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                })
            expect((await send({ claimId: id })).status).toBe(201)
            if (action === 'claim') expect(interactions.claim).toHaveBeenCalledWith(id, id, id)
            else expect(interactions.respond).toHaveBeenCalledWith(id, id, { claimId: id })
            interactions[action].mockClear()
            const response = await send({ claimId: id, userId: id })
            expect(response.status).toBe(400)
            expect((await response.json()).message).toBe('Invalid group input')
            expect((await send({ claimId: 'invalid' })).status).toBe(400)
            expect(interactions[action]).not.toHaveBeenCalled()
        }
    )
    it('does not enqueue after authorization fails', async () => {
        messages.submit.mockRejectedValueOnce(new ForbiddenException())
        expect((await post({ clientMessageId: id, text: 'hello' })).status).toBe(403)
        expect(outbox.flush).not.toHaveBeenCalled()
    })
})
