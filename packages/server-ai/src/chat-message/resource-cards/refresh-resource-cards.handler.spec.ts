jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { currentUserId: () => 'viewer' },
    ResourceCardProviderRegistry: class {}
}))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { createResourceCardContent } from '@xpert-ai/contracts'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import {
    ResourceCardProviderRegistry,
    type ResourceCardReadRequest,
    type ResourceCardContext
} from '@xpert-ai/plugin-sdk'
import { RefreshConversationResourceCardsCommand } from '../commands/refresh-resource-cards.command'
import {
    RefreshConversationResourceCardsHandler,
    RESOURCE_CARD_REFRESH_TIMEOUT_MS
} from './refresh-resource-cards.handler'

const card = (namespace: string, id = 'resource') => ({
    ...createResourceCardContent({
        resource: { namespace, type: 'item', id },
        title: 'Original',
        description: 'Running',
        open: { target: 'workbench.view' as const, viewKey: 'example__view' }
    }),
    messageId: 'message',
    executionId: 'run'
})
function fixture() {
    const a = {
        resolveMany: jest
            .fn()
            .mockImplementation(async (_context: ResourceCardContext, requests: ResourceCardReadRequest[]) =>
                requests.map(({ key, card }) => ({ key, status: 'resolved', card: { ...card, description: 'Done' } }))
            )
    }
    const b = { resolveMany: jest.fn().mockRejectedValue(new Error('Private backend failure')) }
    const registry = {
        find: jest
            .fn()
            .mockImplementation(({ namespace }: { namespace: string }) =>
                namespace === 'a' ? a : namespace === 'b' ? b : undefined
            )
    }
    const command = new RefreshConversationResourceCardsCommand(
        {
            id: 'conversation',
            tenantId: 'tenant',
            organizationId: 'org'
        },
        'thread',
        [card('a'), card('b'), card('static')]
    )
    return {
        a,
        b,
        registry,
        command,
        handler: new RefreshConversationResourceCardsHandler(registry as unknown as ResourceCardProviderRegistry)
    }
}

describe('generic resource card refresh', () => {
    afterEach(() => jest.useRealTimers())
    it('batches by provider, preserves static receipts and isolates errors', async () => {
        const f = fixture()
        const cards = await f.handler.execute(f.command)
        expect(cards).toHaveLength(3)
        expect(cards[0].data.description).toBe('Done')
        expect(cards[1].data.description).toContain('refresh_failed')
        expect(cards[1].data.description).not.toContain('Private')
        expect(cards[2]).toBe(f.command.cards[2])
        expect(f.a.resolveMany).toHaveBeenCalledTimes(1)
        expect(f.a.resolveMany.mock.calls[0][0]).toMatchObject({
            userId: 'viewer',
            tenantId: 'tenant',
            organizationId: 'org',
            conversationId: 'conversation',
            threadId: 'thread'
        })
        expect(cards[0]).toMatchObject({ id: f.command.cards[0].id, messageId: 'message', executionId: 'run' })
        expect(f.command.cards[0].data.description).toBe('Running')
    })

    it('keeps bindings distinct when the same resource appears in different messages', async () => {
        const f = fixture()
        const cards = await f.handler.execute(
            new RefreshConversationResourceCardsCommand(f.command.conversation, 'thread', [
                card('a'),
                { ...card('a'), messageId: 'later-message', executionId: 'later-run' }
            ])
        )
        expect(f.a.resolveMany).toHaveBeenCalledTimes(1)
        expect(cards.map(({ messageId, executionId }) => [messageId, executionId])).toEqual([
            ['message', 'run'],
            ['later-message', 'later-run']
        ])
    })

    it.each(['forbidden', 'not_found'])('replaces stale status with explicit %s', async (reason) => {
        const f = fixture()
        f.a.resolveMany.mockResolvedValue([{ key: '0', status: 'unavailable', reason }])
        const cards = await f.handler.execute(f.command)
        expect(cards[0].data.description).toContain(reason)
        expect(cards[0].data.description).not.toContain('Running')
    })

    it.each(
        [
            [],
            null,
            [{ key: 'unknown', status: 'resolved', card: card('a').data }],
            [{ key: '0', status: 'resolved', card: card('foreign').data }],
            [
                {
                    key: '0',
                    status: 'resolved',
                    card: { ...card('a').data, open: { target: 'url', url: 'https://example.com' } }
                }
            ],
            [
                { key: '0', status: 'resolved', card: card('a').data },
                { key: '0', status: 'resolved', card: card('a').data }
            ]
        ].map((output) => ({ output }))
    )('rejects malformed, missing, duplicate or foreign projections: %j', async ({ output }) => {
        const f = fixture()
        f.a.resolveMany.mockResolvedValue(output)
        const cards = await f.handler.execute(f.command)
        expect(cards[0].data.resource).toEqual(f.command.cards[0].data.resource)
        expect(cards[0].data.description).toContain('refresh_failed')
    })

    it('does not accept forged message ownership or mutate the persisted receipt', async () => {
        const f = fixture()
        f.a.resolveMany.mockImplementation(
            async (_context: ResourceCardContext, requests: ResourceCardReadRequest[]) => {
                requests[0].card.title = 'Updated'
                return [
                    {
                        key: '0',
                        status: 'resolved',
                        card: requests[0].card,
                        messageId: 'foreign',
                        executionId: 'foreign'
                    }
                ]
            }
        )
        const cards = await f.handler.execute(f.command)
        expect(cards[0]).toMatchObject({ messageId: 'message', executionId: 'run', data: { title: 'Updated' } })
        expect(f.command.cards[0].data.title).toBe('Original')
    })

    it('bounds slow reads and ignores late results', async () => {
        jest.useFakeTimers()
        const f = fixture()
        let finish: (value: unknown) => void
        f.a.resolveMany.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve
                })
        )
        const pending = f.handler.execute(f.command)
        await jest.advanceTimersByTimeAsync(RESOURCE_CARD_REFRESH_TIMEOUT_MS + 1)
        const cards = await pending
        expect(f.a.resolveMany.mock.calls[0][0].signal.aborted).toBe(true)
        expect(cards[0].data.description).toContain('refresh_failed')
        finish([{ key: '0', status: 'resolved', card: card('a').data }])
        await Promise.resolve()
        expect(cards[0].data.description).toContain('refresh_failed')
    })

    it('dispatches the single generic command through Nest CQRS', async () => {
        const f = fixture()
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [
                RefreshConversationResourceCardsHandler,
                { provide: ResourceCardProviderRegistry, useValue: f.registry }
            ]
        }).compile()
        try {
            await module.init()
            const cards = await module.get(CommandBus).execute(f.command)
            expect(cards[0].data.description).toBe('Done')
        } finally {
            await module.close()
        }
    })
})
