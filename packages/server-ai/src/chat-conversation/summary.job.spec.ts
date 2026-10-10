import type { Job } from 'bull'
import { ConversationSummaryProcessor, ConversationSummaryReqType } from './summary.job'

describe('ordinary conversation summary boundary', () => {
    const conversations = { findOne: jest.fn() }
    const messages = { findOne: jest.fn() }
    const commands = { execute: jest.fn() }
    const processor = new ConversationSummaryProcessor(
        {} as never,
        conversations as never,
        messages as never,
        commands as never
    )
    const job = {
        data: { conversationId: 'conversation', userId: 'human', types: [] }
    } as Job<ConversationSummaryReqType>
    beforeEach(() => {
        jest.clearAllMocks()
        messages.findOne.mockResolvedValue({})
    })
    it.each(['group', 'group_assistant_runtime'])(
        'does not feed %s messages into ordinary personal-memory summarization',
        async (purpose) => {
            conversations.findOne.mockResolvedValue({ purpose, messages: [{ id: 'message' }] })
            await processor.process(job)
            expect(messages.findOne).not.toHaveBeenCalled()
            expect(commands.execute).not.toHaveBeenCalled()
        }
    )
    it.each(['private', null])('continues ordinary summary processing for %s conversations', async (purpose) => {
        conversations.findOne.mockResolvedValue({ purpose, messages: [{ id: 'message' }] })
        await processor.process(job)
        expect(messages.findOne).toHaveBeenCalledWith('message')
    })
})
