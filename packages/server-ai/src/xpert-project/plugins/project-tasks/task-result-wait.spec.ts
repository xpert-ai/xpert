import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import i18next from 'i18next'
import { waitForPendingTaskReport } from './task-result-wait'
import { ProjectToolEnum } from './constants'

beforeAll(async () => {
    await i18next.init({ lng: 'en' })
})

function fixture() {
    const projectId = randomUUID(),
        taskId = randomUUID(),
        executionId = randomUUID()
    const call = { id: 'read-1', name: ProjectToolEnum.ReadResult, args: { taskId, executionId, expectedRevision: 5 } }
    const observation = {
        projectId,
        taskId,
        executionId,
        invocationId: randomUUID(),
        invocationStatus: 'running',
        reportStatus: 'pending',
        canAwaitDelivery: true,
        nextAction: 'await_delivery'
    }
    const pair = (value = observation): BaseMessage[] => [
        new AIMessage({ content: '', tool_calls: [call] }),
        new ToolMessage({ name: call.name, tool_call_id: call.id, status: 'success', content: JSON.stringify(value) })
    ]
    const repeat = new AIMessage({
        content: '',
        tool_calls: [{ ...call, id: 'read-2', args: { ...call.args, expectedRevision: 11 } }]
    })
    return { projectId, call, observation, pair, repeat }
}

it('ends a repeated pending report read even when the model guesses a newer revision', () => {
    const f = fixture()
    const result = waitForPendingTaskReport(f.pair(), f.repeat, f.projectId)
    expect(result.tool_calls).toHaveLength(0)
    expect(result.content).toContain('result arrives')
    expect(f.repeat.tool_calls).toHaveLength(1)
})

it.each(['another-task', 'independent-dispatch', 'parallel', 'prompt'])(
    'allows %s work after a pending read',
    (mode) => {
        const f = fixture()
        const response = new AIMessage({ content: '', tool_calls: [...f.repeat.tool_calls] })
        if (mode === 'another-task')
            response.tool_calls[0] = { ...f.call, args: { ...f.call.args, taskId: randomUUID() } }
        if (mode === 'independent-dispatch') response.tool_calls[0] = { ...f.call, name: ProjectToolEnum.DispatchTask }
        if (mode === 'parallel')
            response.tool_calls.push({ ...f.call, id: 'dispatch', name: ProjectToolEnum.DispatchTask })
        if (mode === 'prompt') response.tool_calls[0] = { ...f.call, args: { ...f.call.args, source: 'prompt' } }
        expect(waitForPendingTaskReport(f.pair(), response, f.projectId)).toBe(response)
    }
)

it.each(['foreign-project', 'no-wake', 'failed', 'mismatched-call', 'plain-text', 'new-turn', 'fresh-observation'])(
    'does not infer a pending wake from %s',
    (mode) => {
        const f = fixture()
        let messages = f.pair()
        if (mode === 'foreign-project') messages = f.pair({ ...f.observation, projectId: randomUUID() })
        if (mode === 'no-wake') messages = f.pair({ ...f.observation, canAwaitDelivery: false })
        if (mode === 'failed') messages = f.pair({ ...f.observation, invocationStatus: 'failed' })
        if (mode === 'mismatched-call') messages = f.pair({ ...f.observation, executionId: randomUUID() })
        if (mode === 'plain-text') messages = [new AIMessage(JSON.stringify(f.observation))]
        if (mode === 'new-turn') messages.push(new HumanMessage('The result has arrived.'))
        if (mode === 'fresh-observation')
            messages.push(new ToolMessage({ name: ProjectToolEnum.GetTask, tool_call_id: 'new', content: '{}' }))
        expect(waitForPendingTaskReport(messages, f.repeat, f.projectId)).toBe(f.repeat)
    }
)

it.each(['running', 'queued', 'succeeded', 'changed-invocation', 'available-result', 'other-task'])(
    'interprets a fresh %s task observation without discarding unrelated pending evidence',
    (mode) => {
        const f = fixture()
        const active = ['running', 'queued', 'other-task'].includes(mode)
        const fresh = {
            id: mode === 'other-task' ? randomUUID() : f.call.args.taskId,
            projectId: f.projectId,
            executions: [
                {
                    id: f.call.args.executionId,
                    invocationId: mode === 'changed-invocation' ? randomUUID() : f.observation.invocationId,
                    invocationStatus: mode === 'queued' ? 'queued' : mode === 'succeeded' ? 'succeeded' : 'running',
                    result: mode === 'available-result' ? { text: 'Complete report' } : undefined
                }
            ]
        }
        const messages = [
            ...f.pair(),
            new ToolMessage({
                name: ProjectToolEnum.GetTask,
                tool_call_id: 'fresh',
                status: 'success',
                content: JSON.stringify(fresh)
            })
        ]
        const result = waitForPendingTaskReport(messages, f.repeat, f.projectId)
        if (active) expect(result.tool_calls).toHaveLength(0)
        else expect(result).toBe(f.repeat)
    }
)
