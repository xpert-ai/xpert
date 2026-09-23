import { ChatMessage } from '../chat-message/chat-message.entity'
import { ChatMessageStepCategory, TChatMessageStep, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { readThreadSchema } from './thread-reference.contract'
import { projectThreadTurns } from './thread-read-projection'

const options = readThreadSchema.parse({ threadId: 'source' })
const message = (input: Partial<ChatMessage>) => Object.assign(new ChatMessage(), input)
const event = (output: unknown): TChatMessageStep => ({
    category: 'Tool',
    type: ChatMessageStepCategory.List,
    toolset: 'toolset',
    toolset_id: 'toolset',
    title: 'Tool',
    message: '',
    status: 'success',
    created_date: '',
    end_date: '',
    output
})

describe('thread history projection', () => {
    it('groups newest turns first while preserving message order within each turn', () => {
        const rows = [
            message({ id: 'a2', role: 'ai', content: 'Answer 2' }),
            message({ id: 'h2', role: 'human', content: 'Question 2' }),
            message({ id: 'a1', role: 'ai', content: 'Answer 1' }),
            message({ id: 'h1', role: 'human', content: 'Question 1' })
        ]
        const turns = projectThreadTurns(rows, options)
        expect(turns.map((turn) => turn.id)).toEqual(['h2', 'h1'])
        expect(turns[0].messages.map((item) => item.id)).toEqual(['h2', 'a2'])
    })

    it('excludes reasoning, hidden follow-ups, in-progress responses and event outputs by default', () => {
        const rows = [
            message({ id: 'pending', role: 'human', followUpStatus: 'pending', content: 'Do not reveal' }),
            message({ id: 'running', role: 'ai', status: XpertAgentExecutionStatusEnum.RUNNING, content: 'Draft' }),
            message({
                id: 'answer',
                role: 'ai',
                content: [
                    { type: 'reasoning', text: 'Hidden' },
                    { type: 'text', text: 'Visible' }
                ],
                events: [event('Optional tool output')]
            }),
            message({ id: 'question', role: 'human', content: 'Question' })
        ]
        const text = JSON.stringify(projectThreadTurns(rows, options))
        expect(text).toContain('Visible')
        for (const excluded of ['Hidden', 'Do not reveal', 'Draft', 'Optional tool output'])
            expect(text).not.toContain(excluded)
        expect(JSON.stringify(projectThreadTurns(rows, { ...options, includeOutputs: true }))).toContain(
            'Optional tool output'
        )
    })

    it('bounds text, marks truncated and partial pages, and never serializes structured tool internals', () => {
        const row = message({
            id: 'answer',
            role: 'ai',
            content: 'x'.repeat(3000),
            events: [event({ secret: 'runtime' })]
        })
        const turns = projectThreadTurns([row], { ...options, includeOutputs: true })
        expect(turns[0].partial).toBe(true)
        expect(turns[0].messages[0]).toMatchObject({ text: 'x'.repeat(2000), truncated: true, outputs: [] })
    })

    it('enforces the aggregate text budget across large messages and outputs', () => {
        const rows = Array.from({ length: 100 }, (_, index) =>
            message({ id: String(index), role: 'ai', content: 'x'.repeat(25000), events: [event('y'.repeat(25000))] })
        )
        const items = projectThreadTurns(rows, {
            ...options,
            includeOutputs: true,
            maxOutputCharsPerItem: 20000
        }).flatMap((turn) => turn.messages)
        const length = items.reduce(
            (sum, item) =>
                sum + item.text.length + (item.outputs ?? []).reduce((sum, output) => sum + output.text.length, 0),
            0
        )
        expect(length).toBe(60000)
        expect(items.every((item) => item.truncated)).toBe(true)
    })

    it('selects textual tool outputs before applying the output limit', () => {
        const events = [
            ...Array.from({ length: 20 }, () => event(undefined)),
            ...Array.from({ length: 25 }, (_, index) => event(`Output ${index}`))
        ]
        const [turn] = projectThreadTurns([message({ id: 'answer', role: 'ai', content: 'Answer', events })], {
            ...options,
            includeOutputs: true
        })
        expect(turn.messages[0].outputs).toHaveLength(20)
        expect(turn.messages[0].omittedOutputs).toBe(5)
    })
})
