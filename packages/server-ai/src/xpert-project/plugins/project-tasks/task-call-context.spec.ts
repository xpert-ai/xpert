import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { projectTaskCallReceipts, projectTaskContextIds } from './task-call-context'

const projectId = '11111111-1111-4111-8111-111111111111'
const taskId = '22222222-2222-4222-8222-222222222222'
const executionId = '33333333-3333-4333-8333-333333333333'
const invocationId = '44444444-4444-4444-8444-444444444444'
it('bounds fresh reads and never discovers tasks from user text or another project', () => {
    const receipt = JSON.stringify({ tasks: [{ id: taskId, projectId }] })
    const good = new ToolMessage({
        content: receipt,
        name: 'project_create_tasks',
        tool_call_id: 'c',
        status: 'success'
    })
    expect(projectTaskContextIds([new HumanMessage(receipt)], projectId)).toEqual([])
    expect(projectTaskContextIds([good], taskId)).toEqual([])
    expect(projectTaskContextIds([good, good], projectId)).toEqual([taskId])
    const many = new ToolMessage({
        content: JSON.stringify({
            tasks: Array.from({ length: 9 }, (_, index) => ({
                id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
                projectId
            }))
        }),
        name: 'project_create_tasks',
        tool_call_id: 'many',
        status: 'success'
    })
    expect(projectTaskContextIds([many], projectId)).toEqual([])
})
function pair() {
    const call = new AIMessage({
        id: 'source',
        content: '',
        tool_calls: [
            { id: 'call', name: 'project_dispatch_task', args: { taskId, instructions: 'requirements'.repeat(300) } }
        ]
    })
    const reply = new ToolMessage({
        name: 'project_dispatch_task',
        tool_call_id: 'call',
        status: 'success',
        content: JSON.stringify({
            projectId,
            projectTaskId: taskId,
            taskExecutionId: executionId,
            invocationId,
            status: 'running'
        })
    })
    return { call, reply }
}
it('retains an acknowledged dispatch receipt and exact reread pointers without inferring success', () => {
    const { call, reply } = pair(),
        user = new HumanMessage('Keep the acceptance scope unchanged.')
    const before = JSON.stringify([call.toDict(), reply.toDict()])
    const projected = projectTaskCallReceipts([user, call, reply], projectId)
    expect(projected).toHaveLength(2)
    expect(projected[0]).toBe(user)
    expect(projected[1].content).toContain('not successful execution or acceptance')
    expect(projected[1].content).toContain(executionId)
    expect(projected[1].content).toContain('"source":"prompt"')
    expect(JSON.stringify(projected).length).toBeLessThan(1600)
    expect(JSON.stringify([call.toDict(), reply.toDict()])).toBe(before)
    expect(projectTaskCallReceipts(projected, projectId)).toEqual(projected)
})
it('preserves negative findings, unknown tool output, pending calls, foreign scope and signed requests', () => {
    const { call, reply } = pair()
    for (const history of [
        [call],
        [call, new ToolMessage({ ...reply, status: 'error' })],
        [
            call,
            new ToolMessage({ content: 'Uncertain outcome', tool_call_id: 'call', name: reply.name, status: 'success' })
        ],
        [new AIMessage({ content: 'Important finding', tool_calls: call.tool_calls }), reply],
        [
            new AIMessage({
                content: '',
                tool_calls: call.tool_calls,
                additional_kwargs: { encrypted_content: 'signed' }
            }),
            reply
        ],
        [new AIMessage({ content: '', tool_calls: [...call.tool_calls, ...call.tool_calls] }), reply]
    ]) {
        expect(projectTaskCallReceipts(history, projectId)).toEqual(history)
    }
    expect(projectTaskCallReceipts([call, reply], taskId)).toEqual([call, reply])
})
it('preserves created requirements in the receipt, including a negative constraint', () => {
    const call = new AIMessage({
        content: '',
        tool_calls: [
            {
                id: 'create',
                name: 'project_create_tasks',
                args: { tasks: [{ requirements: ['No host deployment', 'r'.repeat(2000)] }] }
            }
        ]
    })
    const reply = new ToolMessage({
        name: 'project_create_tasks',
        tool_call_id: 'create',
        status: 'success',
        content: JSON.stringify({
            tasks: [{ id: taskId, projectId, requirements: ['No host deployment', 'r'.repeat(2000)] }]
        })
    })
    expect(String(projectTaskCallReceipts([call, reply], projectId)[0].content)).toContain('No host deployment')
    const latest = new ToolMessage({
        name: 'project_get_task',
        tool_call_id: 'read',
        status: 'success',
        content: JSON.stringify({ id: taskId, projectId, requirements: ['No host deployment', 'r'.repeat(2000)] })
    })
    const projected = projectTaskCallReceipts([call, reply, latest], projectId)
    expect(String(projected[0].content)).toContain('requirementsSource')
    expect(projected.at(-1)).toBe(latest)
    const changed = new ToolMessage({
        name: 'project_get_task',
        tool_call_id: 'changed',
        status: 'success',
        content: JSON.stringify({ id: taskId, projectId, requirements: ['Changed scope'] })
    })
    expect(String(projectTaskCallReceipts([call, reply, changed], projectId)[0].content)).toContain(
        'No host deployment'
    )
})
