import type { MapNode } from '../../../schema'
import { layout, visibleNodes } from './layout'
import { mapRepresentation, registerSegments, segmentConversationTarget, treeProjection } from './tree-mode'

const threads = [
    { threadId: 'main', title: 'Current', current: true, status: 'idle' },
    { threadId: 'side', title: 'Side', current: false, status: 'idle' }
]
const node = (id: string, kind: MapNode['kind'], parentId: string | null, extra: Partial<MapNode> = {}): MapNode => ({
    id,
    kind,
    parentId,
    title: id,
    preview: '',
    expandable: true,
    ...extra
})
const shared = node('segment:a:h', 'segment', 'conversation:a', {
    conversationId: 'a',
    threadId: 'main',
    segmentThreads: threads,
    messageCount: 20,
    lastHumanMessage: { id: 'question', text: 'Latest question', inherited: false },
    endMessageId: 'answer'
})
const items = [
    node('p', 'project', null),
    node('conversation:a', 'conversation', 'p', { conversationId: 'a' }),
    shared,
    node('segment:a:main', 'segment', shared.id, { conversationId: 'a', endMessageId: 'main-end' }),
    node('segment:a:side', 'segment', shared.id, { conversationId: 'a', endMessageId: 'side-end' }),
    node('conversation:b', 'conversation', 'p', {
        conversationId: 'b',
        sourceConversationId: 'a',
        sourceMessageId: 'answer'
    })
]
describe('tree-only compressed message presentation', () => {
    it('keeps relation, list and search on the original turn representation', () => {
        expect(mapRepresentation('tree', '')).toBe('segments')
        for (const mode of ['graph', 'list', 'tree']) expect(mapRepresentation(mode, 'query')).toBe('turns')
        for (const mode of ['graph', 'list']) expect(mapRepresentation(mode, '')).toBe('turns')
    })
    it('expands new segments locally while preserving collapsed nodes on refresh', () => {
        const expanded = new Set<string>(),
            loaded = new Set<string>()
        registerSegments(items, expanded, loaded)
        expect([...loaded]).toEqual(['segment:a:h', 'segment:a:main', 'segment:a:side'])
        expanded.delete(shared.id)
        registerSegments([...items, node('new', 'segment', shared.id)], expanded, loaded, new Set(loaded))
        expect(expanded.has(shared.id)).toBe(false)
        expect(expanded.has('new')).toBe(true)
        expect(loaded.has('new')).toBe(true)
    })
    it('opens the actual conversation at the last question on the selected branch without a message list', () => {
        expect(segmentConversationTarget(shared, 'side')).toMatchObject({
            conversationId: 'a',
            threadId: 'side',
            messageId: 'question'
        })
        expect(segmentConversationTarget({ ...shared, lastHumanMessage: undefined }, 'main').messageId).toBe('answer')
        expect(
            segmentConversationTarget(
                { ...shared, lastHumanMessage: undefined, endMessageId: undefined, messageCount: 0 },
                'main'
            ).messageId
        ).toBeUndefined()
        expect(() => segmentConversationTarget(shared, 'foreign')).toThrow('Invalid segment branch')
        expect(shared.threadId).toBe('main')
    })
    it('links independent copies at their exact source boundary without mutating other modes', () => {
        const projected = treeProjection(items)
        expect(projected.find((item) => item.id === 'conversation:b')?.parentId).toBe(shared.id)
        expect(items.find((item) => item.id === 'conversation:b')?.parentId).toBe('p')
        expect(treeProjection(projected)).toEqual(projected)
        expect(
            treeProjection(items.filter((item) => item.id !== shared.id)).find((item) => item.id === 'conversation:b')
                ?.parentId
        ).toBe('p')
    })
    it('does not create cycles from corrupt source provenance', () => {
        const self = node('conversation:a', 'conversation', 'p', {
            conversationId: 'a',
            sourceConversationId: 'a',
            sourceMessageId: 'answer'
        })
        expect(treeProjection([items[0], self, shared])[1].parentId).toBe('p')
    })
    it.each(['TB', 'LR'] as const)('lays out actual forks in %s and collapses descendants together', (direction) => {
        const projected = treeProjection(items)
        const expanded = new Set(projected.map((item) => item.id))
        const graph = layout(projected, expanded, {
            mode: 'tree',
            direction,
            style: 'compact',
            showHistory: false,
            showShared: false
        })
        expect(
            graph.edges
                .filter((edge) => edge.source === shared.id)
                .map((edge) => edge.target)
                .sort()
        ).toEqual(['conversation:b', 'segment:a:main', 'segment:a:side'])
        graph.nodes.forEach((current, index) =>
            graph.nodes.slice(index + 1).forEach((other) => {
                expect(
                    current.position.x + current.width! <= other.position.x ||
                        other.position.x + other.width! <= current.position.x ||
                        current.position.y + current.height! <= other.position.y ||
                        other.position.y + other.height! <= current.position.y
                ).toBe(true)
            })
        )
        expanded.delete(shared.id)
        expect(visibleNodes(projected, expanded).map((item) => item.id)).toEqual(['p', 'conversation:a', shared.id])
    })
})
