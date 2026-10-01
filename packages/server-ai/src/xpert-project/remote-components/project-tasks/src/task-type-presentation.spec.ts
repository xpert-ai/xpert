import type { ProjectTaskNode } from '@xpert-ai/contracts'
import { taskIconName, taskTypeLabel } from './task-type-presentation'

describe('shared task type presentation', () => {
    const task: Pick<ProjectTaskNode, 'kind' | 'taskType' | 'presentation'> = {
        kind: 'task',
        taskType: 'bid.tasks.authoring',
        presentation: { icon: 'FilePenLine', label: { en_US: 'Body writing', zh_Hans: '正文编写' } }
    }
    it('keeps business icons independent from tree structure and localizes their accessible label', () => {
        expect(taskIconName(task)).toBe('FilePenLine')
        expect(taskIconName({ ...task, kind: 'summary' })).toBe('FilePenLine')
        expect(taskTypeLabel(task, 'zh-CN', '任务')).toBe('正文编写')
        expect(taskTypeLabel(task, 'en-US', 'Task')).toBe('Body writing')
    })
    it('uses structural fallback for missing or unregistered legacy types', () => {
        expect(taskIconName({ kind: 'task' })).toBe('FileText')
        expect(taskIconName({ kind: 'summary', taskType: 'unknown' })).toBe('Folder')
        expect(taskIconName({ kind: 'milestone', taskType: 'unknown' })).toBe('Flag')
        expect(taskTypeLabel({ kind: 'task', taskType: 'unknown' }, 'zh-CN', '任务')).toBe('任务')
    })
})
