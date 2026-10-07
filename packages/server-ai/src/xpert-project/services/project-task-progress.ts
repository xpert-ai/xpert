import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

export function assertProjectTaskProgress(progress: unknown): void {
    if (progress == null) return
    if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 100) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectTaskProgressInvalid', {
                defaultValue: 'Task progress must be a number between 0 and 100, or null when unknown.'
            })
        )
    }
}
