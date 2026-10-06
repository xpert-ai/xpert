import { projectTaskRuntimeError } from '../runtime/project-task-runtime.errors'
import { BadRequestException } from '@nestjs/common'
import type { IXpertProjectTask } from '@xpert-ai/contracts'
import { t } from 'i18next'

/** Generic task mutation cannot overwrite facts owned by a business provider. */
export function assertOrdinaryTask(task: Pick<IXpertProjectTask, 'providerKey'>): void {
    if (task.providerKey) throw new BadRequestException(t('server-ai:Error.ProjectTaskProviderCommandRequired'))
}

/** Task identity, relations and projection fields use their dedicated commands. */
export function assertOrdinaryTaskInput(input: object): void {
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
        'decisions',
        'conversations'
    ]) {
        if (Object.prototype.hasOwnProperty.call(input, key)) {
            throw new BadRequestException(t('server-ai:Error.ProjectTaskProviderCommandRequired'))
        }
    }
}

/** Native execution endpoints cannot create or alter host-owned Runtime associations. */
export function assertNativeExecutionInput(input: object): void {
    for (const key of [
        'id',
        'taskId',
        'projectId',
        'tenantId',
        'organizationId',
        'createdById',
        'updatedById',
        'attempt',
        'invocationId',
        'invocationStatus',
        'dispatchRequestId',
        'dispatchState',
        'dispatchIntent',
        'purpose',
        'specificationSnapshot'
    ]) {
        if (Object.prototype.hasOwnProperty.call(input, key)) throw projectTaskRuntimeError('Owned')
    }
}
