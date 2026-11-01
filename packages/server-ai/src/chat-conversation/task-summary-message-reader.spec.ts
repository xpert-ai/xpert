import type { ChatMessageService } from '../chat-message/chat-message.service'
import { TaskSummaryMessageReader } from './task-summary-message-reader'

describe('task summary message projections', () => {
    function fixture() {
        const message = {
            id: 'message',
            conversationId: 'conversation',
            content: '<proposed_plan>Original plan</proposed_plan>',
            taskSummary: { version: 1 as const },
            updatedAt: new Date('2026-11-01T00:00:00Z')
        }
        const service = {
            findAllInOrganizationOrTenant: jest.fn(async (options: { select: string[] }) => ({
                items: [options.select.includes('content') ? { ...message } : { ...message, content: undefined }],
                total: 1
            })),
            filterAuthorizedFileRelations: jest.fn(async (value) => value),
            save: jest.fn()
        }
        const reader = new TaskSummaryMessageReader()
        const conversation = { id: 'conversation', threadId: 'thread', tenantId: 'tenant', organizationId: 'org' }
        const read = (actor = 'user') => reader.read(service as unknown as ChatMessageService, conversation, actor)
        return { message, service, reader, read }
    }

    it('reads only versions for unchanged messages and reparses changed messages', async () => {
        const f = fixture()
        expect((await f.read())[0].taskSummary?.plan).toBeDefined()
        expect(f.service.findAllInOrganizationOrTenant).toHaveBeenCalledTimes(2)
        await f.read()
        expect(f.service.findAllInOrganizationOrTenant).toHaveBeenCalledTimes(3)
        expect(f.service.findAllInOrganizationOrTenant.mock.calls[2][0].select).not.toContain('content')
        f.message.updatedAt = new Date('2026-11-01T00:00:01Z')
        f.message.content = '<proposed_plan>Changed plan</proposed_plan>'
        expect((await f.read())[0].taskSummary?.plan?.excerpt).toContain('Changed')
        expect(f.service.findAllInOrganizationOrTenant).toHaveBeenCalledTimes(5)
        expect(f.service.save).not.toHaveBeenCalled()
    })

    it('does not share projections across users or after expiry', async () => {
        const f = fixture()
        await f.read('one')
        await f.read('two')
        expect(f.service.filterAuthorizedFileRelations).toHaveBeenCalledTimes(2)
        const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001)
        try {
            await f.read('one')
            expect(f.service.filterAuthorizedFileRelations).toHaveBeenCalledTimes(3)
        } finally {
            clock.mockRestore()
        }
    })

    it('projects legacy messages without backfill writes', async () => {
        const f = fixture()
        f.service.findAllInOrganizationOrTenant.mockImplementation(async () => ({
            items: [{ ...f.message, taskSummary: undefined }],
            total: 1
        }))
        await f.read()
        await f.read()
        expect(f.service.filterAuthorizedFileRelations).toHaveBeenCalledTimes(2)
        expect(f.service.save).not.toHaveBeenCalled()
    })

    it('rechecks file authorization even when a persisted projection and message version are unchanged', async () => {
        const f = fixture()
        f.service.findAllInOrganizationOrTenant.mockImplementation(async (options) => ({
            items: [{ ...f.message, ...(options.select.includes('content') ? { attachments: [{ id: 'file' }] } : {}) }],
            total: 1
        }))
        f.service.filterAuthorizedFileRelations.mockImplementation(async (message) => ({ ...message, attachments: [] }))
        await f.read()
        await f.read()
        expect(f.service.filterAuthorizedFileRelations).toHaveBeenCalledTimes(2)
        expect(f.service.save).not.toHaveBeenCalled()
    })
})
