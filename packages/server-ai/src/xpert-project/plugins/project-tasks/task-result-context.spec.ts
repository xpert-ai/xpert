import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { projectTaskModelMessages, projectTaskModelView } from './task-result-context'
import { taskResultReadSchema } from '../../runtime/project-task-result-page'

const id = '11111111-1111-4111-8111-111111111111'
const executionId = '22222222-2222-4222-8222-222222222222'
const text = 'begin\n' + '中'.repeat(100000) + '\nblocking finding at end'
const task = {
    id,
    decisionOptions: [{ decisionRef: 'unchanged' }],
    executions: [
        {
            id: executionId,
            invocationRevision: 5,
            result: { text },
            specificationSnapshot: { digest: 'sha256:test', specification: { requirements: ['duplicated'] } }
        }
    ]
}

it('keeps decision references, marks partial text, and leaves the immutable source untouched', () => {
    const projected = projectTaskModelView(task)
    expect(JSON.stringify(projected).length).toBeLessThan(7500)
    expect(projected).toMatchObject({
        decisionOptions: task.decisionOptions,
        executions: [
            {
                result: {
                    text: expect.stringContaining('blocking finding at end'),
                    excerpt: {
                        totalCharacters: text.length,
                        read: { taskId: id, executionId, expectedRevision: 5 }
                    }
                }
            }
        ]
    })
    expect(task.executions[0].result.text).toBe(text)
    expect(task.executions[0].specificationSnapshot.specification.requirements).toEqual(['duplicated'])
    expect(projectTaskModelView(projected)).toEqual(projected)
})

it('bounds legacy checkpoint results while preserving tool pairs and unrelated messages', () => {
    const old = new ToolMessage({
        id: 'old',
        name: 'project_get_task',
        tool_call_id: 'call1',
        content: JSON.stringify(task)
    })
    const recent = new ToolMessage({
        id: 'new',
        name: 'project_get_task',
        tool_call_id: 'call2',
        content: JSON.stringify(task)
    })
    const user = new HumanMessage(JSON.stringify(task))
    const ai = new AIMessage({
        content: '',
        tool_calls: [{ name: 'project_get_task', id: 'call2', args: { taskId: id } }]
    })
    const result = projectTaskModelMessages([old, user, ai, recent])
    expect(result[0]).toMatchObject({ id: 'old', tool_call_id: 'call1' })
    expect(String(result[0].content)).toContain('Earlier task snapshot omitted')
    expect(result[1]).toBe(user)
    expect(result[2]).toBe(ai)
    expect(String(result[3].content).length).toBeLessThan(7500)
    expect(JSON.stringify(result[3].toDict()).length).toBeLessThan(8000)
    expect(old.content).toBe(JSON.stringify(task))
})

it('rejects oversized, negative, or scope-injected page requests', () => {
    const input = { taskId: id, executionId, expectedRevision: 5 }
    expect(taskResultReadSchema.parse(input)).toMatchObject({ offset: 0, limit: 6000 })
    for (const extra of [{ limit: 12001 }, { offset: -1 }, { userId: id }])
        expect(taskResultReadSchema.safeParse({ ...input, ...extra }).success).toBe(false)
})

it('retains step descriptions, status and negative notes without repeating database audit fields', () => {
    const projected = projectTaskModelView({
        ...task,
        steps: [
            {
                id: 'step',
                stepIndex: 1,
                description: 'Verify real deployment',
                status: 'failed',
                notes: 'No installation evidence',
                createdById: 'actor',
                tenantId: 'tenant'
            }
        ]
    })
    expect(projected).toMatchObject({
        steps: [{ id: 'step', stepIndex: 1, status: 'failed', notes: 'No installation evidence' }]
    })
    expect(JSON.stringify(projected)).not.toContain('createdById')
})
