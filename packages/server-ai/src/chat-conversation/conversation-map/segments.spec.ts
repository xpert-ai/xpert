import { messageSegments, replySummary, type MessageLink, type SegmentPath } from './segments'
import { mapNodeSchema } from './schema'

const message = (id: string, role: 'human' | 'ai' = 'human', parentId?: string): MessageLink => ({ id, role, parentId })
const path = (threadId: string, messages: MessageLink[], current = false): SegmentPath => ({
    threadId,
    messages,
    current,
    title: threadId,
    status: 'idle'
})
const build = (...paths: SegmentPath[]) => messageSegments('c', '未命名对话', paths)

describe('lightweight conversation message segments', () => {
    it('compresses a long linear path into one stable node without carrying message lists', () => {
        const messages = Array.from({ length: 80 }, (_, index) =>
            message(`m${index}`, index % 2 ? 'ai' : 'human', index ? `m${index - 1}` : undefined)
        )
        const first = build(path('main', messages, true))
        expect(first).toHaveLength(1)
        expect(first[0]).toMatchObject({
            questionId: 'm78',
            replyId: 'm79',
            node: { messageCount: 80, endMessageId: 'm79' }
        })
        expect(mapNodeSchema.parse(JSON.parse(JSON.stringify(first[0].node))).kind).toBe('segment')
        expect(first[0].node).not.toHaveProperty('messages')
        const appended = build(path('main', [...messages, message('new')], true))
        expect(appended[0].node.id).toBe(first[0].node.id)
        expect(appended[0]).toMatchObject({ questionId: 'new', replyId: undefined, node: { messageCount: 81 } })
    })
    it('deduplicates shared prefixes and splits exactly at nested forks', () => {
        const a = message('a'),
            b = message('b', 'ai', 'a'),
            c = message('c', 'human', 'b'),
            d = message('d', 'ai', 'c')
        const e = message('e', 'human', 'b'),
            f = message('f', 'ai', 'e')
        const plans = build(
            path('main', [a, b, c, d], true),
            path('side', [a, b, e, f]),
            path('nested', [a, b, e, message('g', 'ai', 'e')])
        )
        const nodes = plans.map((plan) => plan.node)
        expect(nodes.map((node) => [node.id, node.messageCount])).toEqual([
            ['segment:c:a', 2],
            ['segment:c:c', 2],
            ['segment:c:e', 1],
            ['segment:c:f', 1],
            ['segment:c:g', 1]
        ])
        expect(nodes[1].parentId).toBe(nodes[0].id)
        expect(nodes[2].parentId).toBe(nodes[0].id)
        expect(nodes[3].parentId).toBe(nodes[2].id)
        expect(nodes[4].parentId).toBe(nodes[2].id)
        expect(plans[3].questionId).toBe('e') // A reply-only branch inherits its preceding question.
        expect(nodes[2].segmentThreads.map((thread) => thread.threadId)).toEqual(['side', 'nested'])
    })
    it('separates edited versions and recompresses when historical paths are excluded', () => {
        const shared = [message('h'), message('a', 'ai', 'h')]
        const original = path('old', [...shared, message('old-question', 'human', 'a')])
        const edited = path('current', [...shared, message('new-question', 'human', 'a')], true)
        expect(build(original, edited).map(({ node }) => node.messageCount)).toEqual([2, 1, 1])
        expect(build(edited).map(({ node }) => node.messageCount)).toEqual([3])
    })
    it('retains empty branches and branches that have not continued yet', () => {
        expect(build(path('empty', [], true))[0].node).toMatchObject({
            messageCount: 0,
            threadId: 'empty',
            current: true
        })
        const shared = [message('a'), message('b', 'ai', 'a')]
        const plans = build(path('main', [...shared, message('c', 'human', 'b')], true), path('waiting', shared))
        expect(plans.map(({ node }) => node.messageCount)).toEqual([2, 0, 1])
        expect(plans[1].node.parentId).toBe(plans[0].node.id)
        expect(build(path('main', shared, true), path('copy', shared)).map(({ node }) => node.messageCount)).toEqual([
            2, 0, 0
        ])
    })
    it('splits at independent conversation source replies, not at arbitrary page limits', () => {
        const messages = [message('h'), message('a', 'ai', 'h'), message('h2', 'human', 'a'), message('a2', 'ai', 'h2')]
        const plans = messageSegments('c', 'Title', [path('main', messages, true)], new Set(['a']))
        expect(plans.map(({ node }) => node.messageCount)).toEqual([2, 2])
        expect(plans.map(({ questionId, replyId }) => [questionId, replyId])).toEqual([
            ['h', 'a'],
            ['h2', 'a2']
        ])
    })
    it('bridges hidden runtime messages and rejects cyclic or conflicting paths', () => {
        const h = message('h'),
            a = message('a', 'ai', 'hidden')
        const hidden: MessageLink = {
            ...message('hidden', 'ai', 'h'),
            messageEnvelope: {
                version: 1,
                presentation: 'runtime',
                source: { type: 'assistant', xpertId: 'assistant' }
            }
        }
        expect(build(path('main', [h, hidden, a]))[0].node.messageCount).toBe(2)
        expect(() => build(path('main', [h, a, h]))).toThrow('Invalid conversation message path')
        expect(() => build(path('main', [h, a]), path('side', [a]))).toThrow(
            'Inconsistent conversation message ancestry'
        )
    })
    it('limits reply previews to two sentences, excludes private blocks, and bounds unpunctuated replies', () => {
        expect(replySummary('第一句。第二句！第三句。')).toBe('第一句。 第二句！')
        expect(replySummary('One. Two! Three?')).toBe('One. Two!')
        expect(
            replySummary([
                { type: 'text', text: 'Visible.' },
                { type: 'reasoning', text: 'private' }
            ])
        ).toBe('Visible.')
        expect(replySummary('a'.repeat(10000))).toHaveLength(241)
        expect(replySummary(undefined)).toBe('')
    })
})
