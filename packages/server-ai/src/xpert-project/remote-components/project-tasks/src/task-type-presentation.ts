import { resolveI18nText, type ProjectTaskIconName, type ProjectTaskNode } from '@xpert-ai/contracts'

type TaskPresentation = Pick<ProjectTaskNode, 'kind' | 'taskType' | 'presentation'>
export type TaskIconName = ProjectTaskIconName | 'Folder' | 'Flag'

export function taskIconName(task: TaskPresentation): TaskIconName {
    if (task.taskType && task.presentation) return task.presentation.icon
    return task.kind === 'summary' ? 'Folder' : task.kind === 'milestone' ? 'Flag' : 'FileText'
}

export function taskTypeLabel(task: TaskPresentation, locale: string, fallback: string) {
    return task.taskType && task.presentation
        ? (resolveI18nText(task.presentation.label, locale) ?? fallback)
        : fallback
}
