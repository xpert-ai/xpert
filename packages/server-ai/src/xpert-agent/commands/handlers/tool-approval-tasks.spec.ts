import type { PregelTaskDescription } from '@langchain/langgraph/dist/pregel/types'
import { toolApprovalTasks } from './tool-approval-tasks'
import i18next from 'i18next'

beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: {} })
})

const pending: PregelTaskDescription = { id: 'task', name: 'read', interrupts: [] }
const pause: PregelTaskDescription = { ...pending, interrupts: [{ value: { type: 'thread_pause' } }] }
const approval: PregelTaskDescription = { ...pending, interrupts: [{ value: 'approve' }] }

it('rejects an unexplained unfinished queue instead of requesting approval', () => {
    expect(() => toolApprovalTasks({ tasks: [pending], next: ['read'] })).toThrow(/unfinished tasks/)
})

it('recognizes static approvals only for explicitly configured nodes', () => {
    expect(
        toolApprovalTasks({ tasks: [pending, { ...pending, id: 'other', name: 'write' }], next: ['read', 'write'] }, [
            'read'
        ])
    ).toEqual([pending])
})

it('recognizes dynamic approvals even with empty next and excludes completed same-name tasks', () => {
    expect(toolApprovalTasks({ tasks: [{ ...pending, result: {} }, approval], next: [] })).toEqual([approval])
})

it('keeps a thread pause distinct from an approval, including a mixed superstep', () => {
    expect(toolApprovalTasks({ tasks: [pause, pending], next: ['read'] })).toEqual([])
    expect(toolApprovalTasks({ tasks: [pause, approval], next: ['read'] })).toEqual([approval])
})
