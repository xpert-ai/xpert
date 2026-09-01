import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

export function assertExecutionBelongsToThread<T extends Pick<IXpertAgentExecution, 'threadId'>>(
    execution: T | null | undefined,
    threadId: string
): T {
    if (!execution?.threadId || execution.threadId !== threadId) {
        throw new ForbiddenException(
            t('server-ai:Error.ExecutionAccessDenied', {
                defaultValue: 'You do not have access to this execution'
            })
        )
    }

    return execution
}
