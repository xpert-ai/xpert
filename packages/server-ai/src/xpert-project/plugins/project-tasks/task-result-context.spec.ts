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

it('places the current task revision before history without changing any revision or evidence', () => {
    const source = { ...task, revision: 28, status: 'todo' }
    const projected = projectTaskModelView(source)
    expect(JSON.stringify(projected)).toMatch(/^\{"id":"[^"]+","revision":28,"status":"todo"/)
    expect(projected).toMatchObject({ revision: 28, executions: [{ invocationRevision: 5 }] })
    expect(projectTaskModelView(projected)).toEqual(projected)
    expect(source.executions[0].result.text).toBe(text)
})

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

it('bounds superseded attempts while keeping current evidence, failure states and exact reread references', () => {
    const source = {
        ...task,
        executions: Array.from({ length: 5 }, (_, attempt) => ({
            ...task.executions[0],
            attempt,
            purpose: { type: 'implementation' },
            status: attempt === 4 ? 'succeeded' : 'failed',
            error: attempt === 4 ? null : 'Required check failed'
        }))
    }
    const result = projectTaskModelView(source)
    expect(JSON.stringify(result).length).toBeLessThan(15000)
    expect(result).toMatchObject({
        decisionOptions: task.decisionOptions,
        executions: [0, 1, 2, 3, 4].map((attempt) => ({
            attempt,
            result: {
                text: expect.stringContaining('blocking finding at end'),
                excerpt: { totalCharacters: text.length, read: { executionId, expectedRevision: 5 } }
            }
        }))
    })
    expect(JSON.stringify(result)).toContain('Required check failed')
    expect(projectTaskModelView(result)).toEqual(result)
    expect(source.executions.every((item) => item.result.text === text)).toBe(true)
})

it('includes independent review Markdown once without dropping its decision or evidence references', () => {
    const source = {
        ...task,
        executions: [{ ...task.executions[0], reviewReport: { format: 'markdown', markdown: text } }]
    }
    const result = projectTaskModelView(source)
    expect(JSON.stringify(result).match(/blocking finding at end/g)).toHaveLength(1)
    expect(result).toMatchObject({
        executions: [
            {
                result: {
                    textSource: 'reviewReport.markdown',
                    excerpt: { read: { executionId, expectedRevision: 5 } }
                },
                reviewReport: { markdown: expect.stringContaining('blocking finding at end') }
            }
        ]
    })
    expect(projectTaskModelView(result)).toEqual(result)
})

it('retains the latest implementation and review independently and does not guess legacy ordering', () => {
    const evidence = 'Required follow-up remains open. '.repeat(100)
    const execution = (attempt: number | undefined, type: 'implementation' | 'review' | undefined) => ({
        ...task.executions[0],
        attempt,
        purpose: type ? { type } : undefined,
        result: { text: evidence }
    })
    const source = {
        ...task,
        executions: [
            execution(3, 'implementation'),
            execution(2, 'review'),
            execution(1, 'implementation'),
            execution(undefined, 'implementation'),
            execution(0, undefined)
        ]
    }
    const projected = projectTaskModelView(source)
    expect(projected).toMatchObject({
        executions: [
            { result: { text: evidence } },
            { result: { text: evidence } },
            {
                result: {
                    text: expect.stringContaining('middle omitted'),
                    excerpt: { totalCharacters: evidence.length }
                }
            },
            { result: { text: evidence } },
            { result: { text: evidence } }
        ]
    })
    expect(projectTaskModelView(projected)).toEqual(projected)
})

it('deduplicates only identical successful report pages, keeping changed revisions and failed reads', () => {
    const page = {
        taskId: id,
        executionId,
        invocationRevision: 5,
        source: 'report',
        offset: 0,
        nextOffset: null,
        totalCharacters: 3000,
        sha256: 'report-hash',
        sourceTruncated: false,
        text: 'Negative finding '.repeat(150)
    }
    const message = (revision = 5, status: 'success' | 'error' = 'success') =>
        new ToolMessage({
            tool_call_id: `read-${revision}-${status}`,
            name: 'project_read_task_result',
            status,
            content: JSON.stringify({ ...page, invocationRevision: revision })
        })
    const history = [message(), message(6), message(5, 'error'), new HumanMessage(JSON.stringify(page)), message()]
    const result = projectTaskModelMessages(history)
    expect(String(result[0].content)).toContain('Identical evidence page')
    expect(result.slice(1)).toEqual(history.slice(1))
    expect(result[0]).toMatchObject({ tool_call_id: 'read-5-success' })
    expect(String(history[0].content)).toContain('Negative finding')
    expect(projectTaskModelMessages(result)).toEqual(result)
})
