import { BadRequestException } from '@nestjs/common'
import type { IXpertProjectTask } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { assertProjectTaskProgress } from './project-task-progress'

/** Generic task mutation cannot overwrite facts owned by a business provider. */
export function assertOrdinaryTask(task: Pick<IXpertProjectTask, 'providerKey'>): void {
    if (task.providerKey) throw new BadRequestException(t('server-ai:Error.ProjectTaskProviderCommandRequired'))
}

/** Task identity, relations and projection fields use their dedicated commands. */
export function assertOrdinaryTaskInput(input: object): void {
    if ('progress' in input) assertProjectTaskProgress(input.progress)
    for (const key of [
        'providerKey',
        'sourceKey',
        'sourceRevision',
        'revision',
        'parentTaskId',
        'predecessorIds',
        'plannedStartAt',
        'plannedEndAt',
        'estimatedDurationMs',
        'diagnostic',
        'executions',
        'conversations'
    ]) {
        if (Object.prototype.hasOwnProperty.call(input, key)) {
            throw new BadRequestException(t('server-ai:Error.ProjectTaskProviderCommandRequired'))
        }
    }
}
