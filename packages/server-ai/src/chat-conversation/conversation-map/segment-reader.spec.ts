import { readSegments, type SegmentThread } from './segment-reader'
import { mapPageSchema } from './schema'

const thread: SegmentThread = { threadId: 'main', title: 'Current', current: true, status: 'idle', headMessageId: 'a2' }
const scope = { conversationId: 'c', tenantId: 'tenant', organizationId: 'org' }
const links = [
    { id: 'h1', role: 'human' },
    { id: 'a1', parentId: 'h1', role: 'ai' },
    { id: 'h2', parentId: 'a1', role: 'human' },
    { id: 'a2', parentId: 'h2', role: 'ai' }
]
describe('tree summary query efficiency', () => {
    it('reads metadata once and hydrates only the final question and reply', async () => {
        const repository = {
            find: jest
                .fn()
                .mockResolvedValueOnce(links)
                .mockResolvedValueOnce([
                    { id: 'h2', role: 'human', content: 'Latest question' },
                    { id: 'a2', role: 'ai', content: 'First sentence. Second sentence. Not returned.' }
                ])
        }
        const nodes = await readSegments(repository, scope, 'Title', [thread])
        expect(repository.find).toHaveBeenCalledTimes(2)
        expect(repository.find.mock.calls[0][0].where).toEqual(scope)
        const topologyColumns = repository.find.mock.calls[0][0].select
        for (const name of ['content', 'reasoning', 'events', 'inputCheckpoint', 'outputCheckpoint', 'attachments'])
            expect(topologyColumns).not.toHaveProperty(name)
        expect(repository.find.mock.calls[1][0].where.id.value.sort()).toEqual(['a2', 'h2'])
        expect(repository.find.mock.calls[1][0].select).not.toHaveProperty('outputCheckpoint')
        expect(nodes[0]).toMatchObject({
            messageCount: 4,
            messageId: 'h2',
            lastHumanMessage: { text: 'Latest question' },
            answer: 'First sentence. Second sentence.'
        })
        expect(nodes[0]).not.toHaveProperty('messages')
        expect(nodes[0]).not.toHaveProperty('questionId')
        expect(JSON.stringify(nodes)).not.toContain('Not returned')
        expect(() =>
            mapPageSchema.parse({
                nodes,
                nextOffset: null,
                total: 1,
                projectId: null,
                projectTitle: 'Project',
                assistantId: 'assistant'
            })
        ).not.toThrow()
    })
    it('shares summary reads across branches and never loads excluded history bodies', async () => {
        const repository = {
            find: jest
                .fn()
                .mockResolvedValueOnce([
                    ...links,
                    { id: 'side', parentId: 'a1', role: 'human' },
                    { id: 'orphan', role: 'human' }
                ])
                .mockResolvedValueOnce([])
        }
        const nodes = await readSegments(repository, scope, 'Title', [
            thread,
            { ...thread, threadId: 'side', current: false, headMessageId: 'side' }
        ])
        expect(nodes.map((node) => node.messageCount)).toEqual([2, 2, 1])
        expect(repository.find.mock.calls[1][0].where.id.value.sort()).toEqual(['a1', 'a2', 'h1', 'h2', 'side'])
        expect(repository.find).toHaveBeenCalledTimes(2)
    })
    it('does not load summary bodies for empty paths and fails closed for foreign or broken heads', async () => {
        const repository = { find: jest.fn().mockResolvedValue(links) }
        const nodes = await readSegments(repository, { ...scope, organizationId: null }, 'Title', [
            { ...thread, headMessageId: null }
        ])
        expect(nodes[0].messageCount).toBe(0)
        expect(repository.find).toHaveBeenCalledTimes(1)
        expect(repository.find.mock.calls[0][0].where.organizationId.type).toBe('isNull')
        await expect(
            readSegments(repository, scope, 'Title', [{ ...thread, headMessageId: 'foreign' }])
        ).rejects.toThrow()
    })
})
