import { getThreadDeletionLineage } from './side-chat-delete-lineage'
import { ChatConversationThread } from './conversation-thread.entity'
import i18next from 'i18next'

beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: {} })
})

const thread = (threadId: string, parentThreadId?: string, purpose: 'side-chat' | 'message-edit' = 'message-edit') =>
    Object.assign(new ChatConversationThread(), { threadId, parentThreadId, metadata: { purpose }, status: 'idle' })
describe('side-chat deletion lineage', () => {
    it('includes nested edit branches without the parent or sibling side chat', () => {
        const main = thread('main'),
            side = thread('side', 'main', 'side-chat'),
            edit = thread('edit', 'side'),
            next = thread('next', 'edit'),
            other = thread('other', 'main', 'side-chat')
        expect(getThreadDeletionLineage(side, [next, other, edit, side, main])).toEqual([side, edit, next])
    })
    it('rejects independent child side chats and cycles', () => {
        const root = thread('root', 'edit', 'side-chat'),
            edit = thread('edit', 'root')
        expect(() => getThreadDeletionLineage(root, [root, edit])).toThrow('Invalid thread lineage')
        expect(() => getThreadDeletionLineage(root, [root, thread('child', 'root', 'side-chat')])).toThrow(
            'independent child'
        )
    })
    it.each(['busy', 'pausing'] as const)('rejects a %s editing branch before any mutation', (status) => {
        const root = thread('side', 'main', 'side-chat'),
            edit = thread('edit', 'side')
        edit.status = status
        expect(() => getThreadDeletionLineage(root, [root, edit])).toThrow('Stop the side chat')
    })
})
