import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'

export function pipelineProjectionConflict(code: string): ConflictException {
    return new ConflictException({ message: t('server-ai:Error.ProjectPipelineProjectionConflict'), code })
}
