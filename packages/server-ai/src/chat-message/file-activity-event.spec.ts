import {
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    appendMessageContent,
    createMessageAppendContextTracker,
    stringifyMessageContent,
    IChatMessage
} from '@xpert-ai/contracts'
import type { TMessageContentFileActivity } from '@xpert-ai/chatkit-types'
import { bindFileActivityEvent } from './file-activity-event'
import { extractChatMessageTaskSummary } from './task-summary'
import { ApplicationMetricsRegistry } from '../metrics/application-metrics'

const receipt: TMessageContentFileActivity = {
    type: 'file_activity',
    id: 'receipt',
    data: {
        version: 1,
        receiptId: 'receipt',
        toolCallId: 'call',
        kind: 'delivery',
        status: 'success',
        updatedAt: '2026-09-24T00:00:00Z',
        outputs: [
            {
                id: 'out',
                kind: 'file',
                title: 'Report',
                status: 'success',
                origin: 'tool',
                resource: { type: 'artifact', artifactId: 'a', artifactVersionId: 'v1' }
            }
        ]
    }
}

describe('file activity event persistence and metrics', () => {
    it('does not leak internal facts into text or interrupt a text stream', () => {
        const tracker = createMessageAppendContextTracker()
        const first = { type: 'text' as const, id: 'text-stream', text: 'Hello' }
        const last = { type: 'text' as const, id: 'text-stream', text: ' world' }
        tracker.resolve({ incoming: first })
        const context = tracker.current()
        tracker.resolve({ incoming: receipt })
        expect(tracker.current()).toEqual(context)
        expect(tracker.resolve({ incoming: last }).messageContext.joinHint).toBe('none')
        expect(stringifyMessageContent(receipt)).toBe('')
        expect(stringifyMessageContent([first, receipt, last])).toBe('Hello world')
    })
    it('binds, persists and replays a fact without changing reply status or counting a tool', () => {
        const event = bindFileActivityEvent(
            { type: ChatMessageTypeEnum.EVENT, event: ChatMessageEventTypeEnum.ON_CHAT_EVENT, data: receipt },
            { messageId: 'reply', executionId: 'execution' }
        )
        expect(event?.type).toBe(ChatMessageTypeEnum.MESSAGE)
        expect(event?.data).toMatchObject({ type: 'file_activity', messageId: 'reply', executionId: 'execution' })
        const message = { id: 'reply', role: 'ai', status: 'success', content: '' } as IChatMessage
        if (!event) throw new Error('Missing event')
        appendMessageContent(message, event.data)
        appendMessageContent(message, event.data)
        expect(message.content).toHaveLength(1)
        expect(message.status).toBe('success')
        const summary = extractChatMessageTaskSummary(message)
        expect(summary.outputs).toEqual([
            expect.objectContaining({ resource: { type: 'artifact', artifactId: 'a', artifactVersionId: 'v1' } })
        ])
        const metrics = new ApplicationMetricsRegistry()
        metrics.recordToolMessage(event.data)
        metrics.recordToolComponentMessage(event.data, [])
        const realTool = {
            id: 'call',
            type: 'component',
            data: { id: 'call', category: 'Tool', type: 'program', tool: 'sandbox_shell', status: 'success' }
        }
        metrics.recordToolComponentMessage(realTool, [])
        metrics.recordToolComponentMessage(realTool, [realTool])
        expect(metrics.render()).toContain(
            'xpert_tool_calls_total{status="success",tool="sandbox_shell",toolset="unknown"} 1'
        )
    })
    it('ignores explicitly identified legacy receipts, including raw tool events', () => {
        const metrics = new ApplicationMetricsRegistry()
        const data = {
            id: 'receipt',
            tool: 'sandbox_shell',
            status: 'success',
            _meta: {
                'xpertai/taskSummary': {
                    version: 1,
                    fileActivityVersion: 1,
                    fileActivityToolCallId: 'call',
                    fileChanges: []
                }
            }
        }
        metrics.recordToolMessage(data)
        metrics.recordToolComponentMessage({ id: 'receipt', type: 'component', data }, [])
        expect(metrics.render()).not.toContain('xpert_tool_calls_total{')
        metrics.recordToolMessage({ id: 'real', tool: 'sandbox_shell', title: 'File changes', status: 'success' })
        expect(metrics.render()).toContain('xpert_tool_calls_total{')
    })
    it('does not reinterpret unrelated or malformed events', () => {
        expect(
            bindFileActivityEvent({ type: 'event', event: 'on_tool_message', data: receipt }, { messageId: 'reply' })
        ).toBeNull()
        expect(
            bindFileActivityEvent(
                { type: 'event', event: 'on_chat_event', data: { ...receipt, data: {} } },
                { messageId: 'reply' }
            )
        ).toBeNull()
    })
})
