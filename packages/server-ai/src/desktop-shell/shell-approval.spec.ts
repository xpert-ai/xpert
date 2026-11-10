import { randomUUID } from 'node:crypto'
import { Annotation, Command, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import type { ShellPreparationRequest } from '@xpert-ai/contracts'
import { requestShellApproval, requestShellComputerInfo } from './shell-approval'

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
    it('discovers the client platform without creating an execution approval', async () => {
        const graph = new StateGraph(state)
            .addNode('info', async () => ({ result: JSON.stringify(await requestShellComputerInfo('call_info')) }))
            .addEdge(START, 'info')
            .addEdge('info', END)
            .compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: randomUUID() } }
        await graph.invoke({}, config)
        const pending = await graph.getState(config)
        expect(pending.tasks[0].interrupts?.[0]?.value).toEqual({
            clientToolCalls: [{ id: 'call_info:info', name: 'desktop_shell_info', args: {} }]
        })
        const info = { available: true, platform: 'win32', shell: 'powershell.exe', name: 'Windows', cwd: 'C:\\work' }
        const result = await graph.invoke(
            new Command({
                resume: {
                    toolMessages: [{ tool_call_id: 'call_info:info', status: 'success', content: JSON.stringify(info) }]
                }
            }),
            config
        )
        expect(JSON.parse(result.result)).toEqual(info)
        expect((await graph.getState(config)).tasks).toEqual([])
    })
    it('preserves a Windows cwd through preparation and explicit approval', async () => {
        const f = fixture()
        f.prepared.cwd = 'C:\\Users\\测试 User'
        f.response.toolMessages[0].content = JSON.stringify(f.prepared)
        await f.graph.invoke({}, f.config)
        await f.graph.invoke(new Command({ resume: f.response }), f.config)
        expect(f.execute).not.toHaveBeenCalled()
        const pending = await f.graph.getState(f.config)
        expect(pending.tasks[0].interrupts?.[0]?.value).toMatchObject({
            actionRequests: [{ args: { cwd: f.prepared.cwd } }]
        })
        await f.graph.invoke(new Command({ resume: { decisions: [{ type: 'approve' }] } }), f.config)
        expect(f.execute).toHaveBeenCalledWith(f.prepared)
    })
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
