import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages'
import type { PregelTaskDescription } from '@langchain/langgraph/dist/pregel/types'
import { findToolCallOrigin } from './tool-call-origin'
import i18next from 'i18next'

beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: {} })
})

const call = (id: string) => ({ id, name: 'read', args: { file: id } })
const task: PregelTaskDescription = { id: 'task-2', name: 'read', interrupts: [], path: ['__pregel_push', 1] }
const checkpoint = {
    channel_values: {
        __pregel_tasks: [
            [],
            [
                { node: 'read', args: { toolCall: call('call-1') } },
                {
                    node: 'read',
                    args: { __xpertToolInput: 'dispatch_snapshot_v1', snapshotId: 'batch', toolCall: call('call-2') }
                }
            ]
        ]
    }
}

it.each([AIMessage, AIMessageChunk])(
    'locates the original %p by ID across channels and trailing results',
    (Message) => {
        const values = {
            agent_old_channel: { messages: [new Message({ content: '', tool_calls: [call('old-call')] })] },
            agent_current_channel: {
                messages: [
                    new Message({ id: 'ai-original', content: '', tool_calls: [call('call-1'), call('call-2')] }),
                    new ToolMessage({ content: 'done', tool_call_id: 'call-1' })
                ]
            }
        }
        expect(findToolCallOrigin(values, task, checkpoint)).toMatchObject({
            channelName: 'agent_current_channel',
            message: { id: 'ai-original' },
            toolCall: call('call-2')
        })
    }
)

it('allows an unambiguous legacy call after completed results', () => {
    const values = {
        agent_test_channel: {
            messages: [
                new AIMessage({ content: '', tool_calls: [call('call-1'), call('call-2')] }),
                new ToolMessage({ content: 'done', tool_call_id: 'call-1' })
            ]
        }
    }
    expect(findToolCallOrigin(values, task)?.toolCall.id).toBe('call-2')
})

it('rejects ambiguous legacy tasks instead of assigning the first same-name call', () => {
    const values = {
        agent_test_channel: { messages: [new AIMessage({ content: '', tool_calls: [call('call-1'), call('call-2')] })] }
    }
    expect(() => findToolCallOrigin(values, task)).toThrow(/task-2/)
})

it('does not fall back to a same-name call when the persisted ID is absent from history', () => {
    const values = {
        agent_test_channel: { messages: [new AIMessage({ content: '', tool_calls: [call('different')] })] }
    }
    expect(() => findToolCallOrigin(values, task, checkpoint)).toThrow(/task-2/)
})

it('rejects a Send packet for a different task node', () => {
    expect(() => findToolCallOrigin({}, { ...task, name: 'write' }, checkpoint)).toThrow(/task-2/)
})

it('does not associate a current workflow task with an older tool-calling turn', () => {
    const values = {
        agent_test_channel: {
            messages: [new AIMessage({ content: '', tool_calls: [call('old')] }), new AIMessage('current turn')]
        }
    }
    expect(findToolCallOrigin(values, { ...task, path: ['__pregel_pull', 'read'] })).toBeUndefined()
})
