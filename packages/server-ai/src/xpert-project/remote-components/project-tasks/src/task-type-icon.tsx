import { CodingToolIcon } from '../../../../shared/coding-tools/coding-tool-icon'
import { codingToolBrand } from '../../../../shared/coding-tools/branding'
import {
    FileText,
    FileScan,
    FileSearch,
    ListChecks,
    ListTree,
    ShieldCheck,
    FilePenLine,
    Workflow,
    Images,
    FolderInput,
    FileOutput,
    Folder,
    Flag,
    type LucideIcon
} from 'lucide-react'
import type { ProjectTaskNode } from '@xpert-ai/contracts'
import { taskIconName, taskTypeLabel, type TaskIconName } from './task-type-presentation'

const icons: Record<TaskIconName, LucideIcon> = {
    FileText,
    FileScan,
    FileSearch,
    ListChecks,
    ListTree,
    ShieldCheck,
    FilePenLine,
    Workflow,
    Images,
    FolderInput,
    FileOutput,
    Folder,
    Flag
}

/** Every task view uses this icon; tree controls, status and assignee remain separate. */
export function TaskTypeIcon({
    task,
    locale,
    fallbackLabel
}: {
    task: Pick<ProjectTaskNode, 'kind' | 'taskType' | 'presentation' | 'executor'>
    locale: string
    fallbackLabel: string
}) {
    if (
        task.kind === 'task' &&
        !(task.taskType && task.presentation) &&
        task.executor &&
        codingToolBrand(task.executor)
    ) {
        return <CodingToolIcon {...task.executor} />
    }
    const Icon = icons[taskIconName(task)]
    const label = taskTypeLabel(task, locale, fallbackLabel)
    return (
        <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 text-muted-foreground">
            <Icon aria-hidden className="size-4" />
        </span>
    )
}
