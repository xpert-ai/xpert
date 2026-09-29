import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { Command, END, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { createInterruptAfterNode } from './interrupt-after'
import { ToolNode } from '../../xpert-agent/commands/handlers/tool_node'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import i18next from 'i18next'

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn(async () => undefined) }))

function fixture() {
    const tool = jest.fn(() => ({
        messages: [new ToolMessage({ name: 'configure', tool_call_id: 'call-1', content: 'form shown' })]
    }))
    const model = jest.fn(() => ({ messages: [new AIMessage('continued')] }))
    const graph = new StateGraph(MessagesAnnotation)
        .addNode('tool', tool)
        .addNode('gate', createInterruptAfterNode('', [{ name: 'configure', app: true }]))
        .addNode('model', model)
        .addEdge(START, 'tool')
        .addEdge('tool', 'gate')
        .addEdge('gate', 'model')
        .addEdge('model', END)
        .compile({ checkpointer: new MemorySaver() })
    const config = { configurable: { thread_id: 'test' } }
    const input = {
        messages: [new AIMessage({ content: '', tool_calls: [{ name: 'configure', id: 'call-1', args: {} }] })]
    }
    return { graph, config, input, tool, model }
}

describe('interruptAfter', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
    it('does not pause when the actual ToolNode fails before creating its App', async () => {
        const failingTool = tool(
            async () => {
                throw new Error('configuration failed')
            },
            { name: 'configure', description: 'Configure', schema: z.object({}) }
        )
        const model = jest.fn(() => ({}))
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('tool', new ToolNode([failingTool], { toolName: 'Test' }))
            .addNode('gate', createInterruptAfterNode('', [{ name: 'configure', app: true }]))
            .addNode('model', model)
            .addEdge(START, 'tool')
            .addEdge('tool', 'gate')
            .addEdge('gate', 'model')
            .addEdge('model', END)
            .compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: 'failure' } }
        await graph.invoke(
            { messages: [new AIMessage({ content: '', tool_calls: [{ name: 'configure', id: 'call', args: {} }] })] },
            config
        )
        expect((await graph.getState(config)).next).toEqual([])
        expect(model).toHaveBeenCalledTimes(1)
    })

    it('delivers inline attachments to the resumed model without rerunning the tool', async () => {
        const f = fixture()
        await f.graph.invoke(f.input, f.config)
        await f.graph.invoke(
            new Command({
                resume: {
                    toolCallId: 'call-1',
                    message: 'Review these',
                    files: [
                        { name: 'plan.png', mimeType: 'image/png', fileUrl: 'data:image/png;base64,aW1hZ2U=' },
                        { name: 'note.wav', mimeType: 'audio/wav', fileUrl: 'data:audio/wav;base64,YXVkaW8=' },
                        { name: 'brief.pdf', mimeType: 'application/pdf', fileUrl: 'data:application/pdf;base64,cGRm' }
                    ]
                }
            }),
            f.config
        )
        const state = await f.graph.getState(f.config)
        expect(state.values.messages.at(-2).content).toEqual([
            { type: 'text', text: 'Review these' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
            { type: 'audio', source_type: 'base64', mime_type: 'audio/wav', data: 'YXVkaW8=', filename: 'note.wav' },
            { type: 'file', source_type: 'base64', mime_type: 'application/pdf', data: 'cGRm', filename: 'brief.pdf' }
        ])
        expect(f.tool).toHaveBeenCalledTimes(1)
    })
    it('checkpoints the tool result and resumes without running the tool again', async () => {
        const f = fixture()
        await f.graph.invoke(f.input, f.config)
        const state = await f.graph.getState(f.config)
        expect(state.tasks[0].interrupts[0].value).toEqual({
            type: 'tool_after',
            toolName: 'configure',
            toolCallId: 'call-1',
            app: true
        })
        expect(f.tool).toHaveBeenCalledTimes(1)
        expect(f.model).not.toHaveBeenCalled()
        await f.graph.invoke(
            new Command({ resume: { toolCallId: 'call-1', message: 'Settings saved. Read them and continue.' } }),
            f.config
        )
        expect(f.tool).toHaveBeenCalledTimes(1)
        expect(f.model).toHaveBeenCalledTimes(1)
        const updated = await f.graph.getState(f.config)
        expect(updated.values.messages.filter((message) => message.id === 'tool-after:call-1')).toHaveLength(1)
        expect(updated.values.messages.at(-2)?.content).toBe('Settings saved. Read them and continue.')
    })
    it('rejects a response from another App/tool call', async () => {
        const f = fixture()
        await f.graph.invoke(f.input, f.config)
        await expect(f.graph.invoke(new Command({ resume: { toolCallId: 'other' } }), f.config)).rejects.toThrow(
            'does not match'
        )
        expect(f.tool).toHaveBeenCalledTimes(1)
        expect(f.model).not.toHaveBeenCalled()
    })
    it('waits for concurrent tool results and acknowledges each configured tool once', async () => {
        const form = jest.fn(() => ({ messages: [new ToolMessage({ tool_call_id: 'form', content: 'form' })] }))
        const other = jest.fn(() => ({ messages: [new ToolMessage({ tool_call_id: 'other', content: 'other' })] }))
        const model = jest.fn(() => ({}))
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('form', form)
            .addNode('other', other)
            .addNode('gate', createInterruptAfterNode('', [{ name: 'configure', app: true }, { name: 'other' }]))
            .addNode('model', model)
            .addEdge(START, 'form')
            .addEdge(START, 'other')
            .addEdge('form', 'gate')
            .addEdge('other', 'gate')
            .addEdge('gate', 'model')
            .addEdge('model', END)
            .compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: 'parallel' } }
        await graph.invoke(
            {
                messages: [
                    new AIMessage({
                        content: '',
                        tool_calls: [
                            { name: 'configure', id: 'form', args: {} },
                            { name: 'other', id: 'other', args: {} }
                        ]
                    })
                ]
            },
            config
        )
        expect(model).not.toHaveBeenCalled()
        await graph.invoke(new Command({ resume: { toolCallId: 'form' } }), config)
        expect(model).not.toHaveBeenCalled()
        await graph.invoke(new Command({ resume: { toolCallId: 'other' } }), config)
        expect(model).toHaveBeenCalledTimes(1)
        expect(form).toHaveBeenCalledTimes(1)
        expect(other).toHaveBeenCalledTimes(1)
    })
    it('skips errors so the Agent can repair a failed tool rather than waiting for a nonexistent form', async () => {
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('gate', createInterruptAfterNode('', [{ name: 'configure' }]))
            .addEdge(START, 'gate')
            .addEdge('gate', END)
            .compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: 'failed' } }
        await graph.invoke(
            {
                messages: [
                    new AIMessage({ content: '', tool_calls: [{ name: 'configure', id: 'call-1', args: {} }] }),
                    new ToolMessage({ name: 'configure', tool_call_id: 'call-1', content: 'failed', status: 'error' })
                ]
            },
            config
        )
        expect((await graph.getState(config)).next).toEqual([])
    })
})
