import type { ChatGroupCommunication } from '@xpert-ai/contracts'
import { groupModelInput } from './group-context'
import { publicGroupDelta } from './group-stream.service'

describe('group public/private projections', () => {
    it.each<Pick<ChatGroupCommunication, 'projectTask' | 'runtimeResult'>>([
        {},
        {
            projectTask: {
                invocationId: 'invocation',
                projectId: 'project',
                projectTaskId: 'task',
                taskExecutionId: 'attempt'
            }
        },
        {
            runtimeResult: {
                invocationId: 'invocation',
                consumerExecutionId: 'continuation',
                revision: 1,
                projectId: 'project',
                projectTaskId: 'task',
                taskExecutionId: 'attempt',
                specificationDigest: 'digest'
            }
        }
    ])('keeps author identity and public reply guidance for ordinary, task and result inputs (%#)', (metadata) => {
        const input = groupModelInput({
            self: { id: 'e', name: 'E', kind: 'assistant', subjectId: 'expert-e', role: 'member', active: true },
            members: [],
            background: [],
            addressed: {
                id: 'm',
                text: 'Estimate delivery',
                communication: {
                    ...metadata,
                    intent: 'request',
                    senderId: 'c',
                    recipientIds: ['e'],
                    rootMessageId: 'root',
                    rootUserId: 'a',
                    hop: 1
                }
            }
        })
        expect(input).toContain('participant e')
        expect(input).toContain('"senderId":"c"')
        expect(input).toContain('asynchronous')
        expect(input).toContain('Background only')
        expect(input).toContain('Your final reply is posted directly to this group and visible to all members')
        expect(input).toContain('address the requester or relevant members directly')
        expect(input).toContain('Do not frame it as an internal execution report')
        expect(input).toContain('keep the final reply to a brief closing remark or necessary new information')
        expect(input).toContain('avoid repeating the full message or adding a redundant summary')
        expect(input).toContain('Keep all public group communication concise')
        expect(input).toContain('visible replies, progress updates, and text sent through send_group_message')
        expect(input).toContain('Default to 1-3 short sentences or bullets')
        expect(input).toContain('Do not expose internal technical details')
        expect(input).toContain('Explain failures in plain language')
        expect(input).toContain(
            'Include the requested deliverables and necessary evidence even when they need more detail'
        )
        expect(input).toContain('claim success before execution or acceptance is confirmed')
    })
    it('publishes text deltas only, never tool/reasoning/state payloads', () => {
        expect(publicGroupDelta({ type: 'message', data: 'Hello' })).toBe('Hello')
        expect(publicGroupDelta({ type: 'message', data: { type: 'text', text: '@A hello' } })).toBe('@A hello')
        for (const payload of [
            { type: 'message', data: { type: 'reasoning', text: 'private' } },
            { type: 'message', data: { type: 'tool', text: 'private' } },
            { type: 'event', event: 'on_tool_message', data: { text: 'private' } },
            { type: 'values', data: { messages: [{ content: 'private' }] } }
        ])
            expect(publicGroupDelta(payload)).toBeUndefined()
    })
})
