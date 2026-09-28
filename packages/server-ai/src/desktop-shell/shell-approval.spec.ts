import { randomUUID } from 'node:crypto'
import { Annotation, Command, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import type { ShellPreparationRequest } from '@xpert-ai/contracts'
import { requestShellApproval } from './shell-approval'

jest.mock('i18next', () => ({ t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue }))

const state = Annotation.Root({ result: Annotation<string>() })
function fixture(decision: 'pending' | 'approved' = 'pending') {
    const input: ShellPreparationRequest = {
        kind: 'desktop-shell',
        assistantId: randomUUID(),
        threadId: randomUUID(),
        runId: randomUUID(),
        toolCallId: 'call_1',
        command: 'pwd',
        timeoutSec: 30
    }
    const execute = jest.fn()
    const graph = new StateGraph(state)
        .addNode('shell', async () => {
            const ready = await requestShellApproval(input)
            if (ready) execute(ready)
            return { result: ready ? 'executed' : 'denied' }
        })
        .addEdge(START, 'shell')
        .addEdge('shell', END)
        .compile({ checkpointer: new MemorySaver() })
    const config = { configurable: { thread_id: input.threadId } }
    const prepared = {
        kind: 'desktop-shell',
        grantId: randomUUID(),
        deviceName: 'Fixture',
        cwd: '/tmp',
        expiresAt: Date.now() + 60000,
        decision
    }
    const response = {
        toolMessages: [
            {
                tool_call_id: 'call_1:prepare',
                name: 'desktop_shell_prepare',
                status: 'success',
                content: JSON.stringify(prepared)
            }
        ]
    }
    return { graph, config, execute, prepared, response }
}

describe('Shell two-stage interruption', () => {
    it('does not execute until preparation AND explicit approval have both resumed', async () => {
        const f = fixture()
        await f.graph.invoke({}, f.config)
        expect(f.execute).not.toHaveBeenCalled()
        await f.graph.invoke(new Command({ resume: f.response }), f.config)
        expect(f.execute).not.toHaveBeenCalled()
        const pending = await f.graph.getState(f.config)
        expect(pending.tasks[0].interrupts?.[0]?.value).toMatchObject({
            host: { id: f.prepared.grantId },
            toolCallId: 'call_1'
        })
        await f.graph.invoke(new Command({ resume: { decisions: [{ type: 'approve' }] } }), f.config)
        expect(f.execute).toHaveBeenCalledTimes(1)
        expect(f.execute).toHaveBeenCalledWith(f.prepared)
    })
    it('returns a refusal without execution when approval is rejected', async () => {
        const f = fixture()
        await f.graph.invoke({}, f.config)
        await f.graph.invoke(new Command({ resume: f.response }), f.config)
        const result = await f.graph.invoke(new Command({ resume: { decisions: [{ type: 'reject' }] } }), f.config)
        expect(result.result).toBe('denied')
        expect(f.execute).not.toHaveBeenCalled()
    })
    it('only skips interactive approval when the host returns its already approved one-command permit', async () => {
        const f = fixture('approved')
        await f.graph.invoke({}, f.config)
        const result = await f.graph.invoke(new Command({ resume: f.response }), f.config)
        expect(result.result).toBe('executed')
        expect(f.execute).toHaveBeenCalledTimes(1)
    })
    it('does not execute when the native host is unavailable', async () => {
        const f = fixture()
        await f.graph.invoke({}, f.config)
        const result = await f.graph.invoke(
            new Command({
                resume: {
                    toolMessages: [{ tool_call_id: 'call_1:prepare', status: 'error', content: 'DEVICE_OFFLINE' }]
                }
            }),
            f.config
        )
        expect(result.result).toBe('denied')
        expect(f.execute).not.toHaveBeenCalled()
    })
})
