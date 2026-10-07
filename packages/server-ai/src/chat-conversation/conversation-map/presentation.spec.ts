import type { IChatMessage } from '@xpert-ai/contracts'
import { humanMessageSummary, latestUpdate, turnNodes, visibleText } from './presentation'

const message = (
    id: string,
    role: 'human' | 'ai' | 'system',
    content: IChatMessage['content'],
    thread = 'main'
): IChatMessage => ({ id, role, content, conversationId: 'conversation', createdInThreadId: thread })
describe('conversation map presentation', () => {
    it('summarizes human text only and marks inherited context without leaking internal blocks', () => {
        const question = message('h', 'human', [
            { type: 'text', text: '  Delivery\n risk  ' },
            { type: 'reasoning', text: 'private' },
            { type: 'tool', input: 'secret' }
        ])
        expect(humanMessageSummary(question, 'side')).toEqual({ id: 'h', text: 'Delivery risk', inherited: true })
        expect(humanMessageSummary(question, 'main')?.inherited).toBe(false)
        expect(humanMessageSummary(message('a', 'ai', 'Answer'), 'main')).toBeUndefined()
        expect(humanMessageSummary(undefined, 'main')).toBeUndefined()
        expect(
            humanMessageSummary(
                {
                    ...question,
                    messageEnvelope: {
                        version: 1,
                        presentation: 'runtime',
                        source: { type: 'assistant', xpertId: 'assistant' }
                    }
                },
                'main'
            )
        ).toBeUndefined()
        expect(humanMessageSummary(message('h', 'human', [{ type: 'image' }]), 'main')?.text).toBe('')
        expect(humanMessageSummary(message('long', 'human', 'x'.repeat(900)), 'main')?.text).toHaveLength(601)
    })
    it('uses real timestamps and includes the latest visible reply in the turn update time', () => {
        const humanAt = new Date('2026-10-07T01:00:00Z')
        const answerAt = new Date('2026-10-07T02:00:00Z')
        expect(latestUpdate(undefined, new Date('invalid'))).toBeUndefined()
        expect(latestUpdate(answerAt, humanAt)).toBe(answerAt.toISOString())
        const human = { ...message('h', 'human', 'Delivery risk'), createdAt: humanAt }
        expect(humanMessageSummary(human, 'main')?.createdAt).toBe(humanAt.toISOString())
        expect(
            turnNodes(
                [
                    human,
                    { ...message('a', 'ai', 'Visible reply'), updatedAt: answerAt },
                    { ...message('s', 'system', 'Internal'), updatedAt: new Date('2026-10-07T03:00:00Z') }
                ],
                'main',
                'conversation',
                true,
                '',
                'Delivery planning'
            )[0]
        ).toMatchObject({
            conversationTitle: 'Delivery planning',
            updatedAt: answerAt.toISOString()
        })
    })
    it('exposes only text blocks, excluding reasoning and tool inputs', () => {
        expect(
            visibleText([
                { type: 'text', text: 'visible' },
                { type: 'reasoning', text: 'private' },
                { type: 'tool', input: 'secret' }
            ])
        ).toBe('visible')
        expect(
            turnNodes(
                [
                    message('s', 'system', 'hidden'),
                    message('h', 'human', 'Question'),
                    message('a', 'ai', [{ type: 'text', text: 'Answer' }])
                ],
                'main',
                'conversation',
                false
            )
        ).toMatchObject([{ messageId: 'h', title: 'Question', answer: 'Answer', branchAvailable: false }])
    })
    it('collapses inherited turns but keeps a shared question with a new answer', () => {
        const messages = [
            message('h1', 'human', 'Shared question'),
            message('a1', 'ai', 'Shared answer'),
            message('h2', 'human', 'Continued question'),
            message('a2', 'ai', 'New answer', 'side')
        ]
        expect(turnNodes(messages, 'side', 'conversation', false).map((node) => node.messageId)).toEqual(['h2'])
        expect(turnNodes(messages, 'side', 'conversation', true)).toHaveLength(2)
    })
    it('searches full visible content and returns a bounded matching excerpt', () => {
        const nodes = turnNodes(
            [message('h', 'human', 'Question'), message('a', 'ai', 'A'.repeat(9000) + 'needle' + 'Z'.repeat(9000))],
            'main',
            'conversation',
            true,
            'needle'
        )
        expect(nodes).toHaveLength(1)
        expect(nodes[0].answer).toContain('needle')
        expect(nodes[0].answer.length).toBeLessThanOrEqual(4002)
        expect(turnNodes([message('h', 'human', 'Question')], 'main', 'conversation', true, 'absent')).toEqual([])
    })
})
