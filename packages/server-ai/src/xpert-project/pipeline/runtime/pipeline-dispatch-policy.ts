// Deployment drain switch: every API/worker must use the same value. Pausing
// prevents new effects; observation, cancellation and projection stay available.
import { ServiceUnavailableException } from '@nestjs/common'
import { t } from 'i18next'

export function pipelineDispatchEnabled(): boolean {
    const value = process.env.XPERT_PIPELINE_DISPATCH_ENABLED
    return value === undefined || value === 'true' || value === '1'
}

export function assertPipelineDispatchEnabled(): void {
    if (!pipelineDispatchEnabled())
        throw new ServiceUnavailableException({
            code: 'PIPELINE_DISPATCH_PAUSED',
            message: t('server-ai:Error.ProjectPipelineDispatchPaused')
        })
}
