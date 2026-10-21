import { Controller, Get, Param, BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ArtifactAnalyticsInventoryService } from './artifact-analytics-inventory.service'

const id = new ZodValidationPipe(
    z.string().uuid(),
    () =>
        new BadRequestException({
            code: 'ANALYTICS_INVALID_REQUEST',
            message: t('server-ai:Error.AnalyticsQueryInvalid', {
                defaultValue: 'Analytics query is unavailable or invalid'
            })
        })
)
@Controller('artifacts/analytics-inventory')
export class ArtifactAnalyticsInventoryController {
    constructor(private readonly inventory: ArtifactAnalyticsInventoryService) {}
    @Get(':artifactId/versions/:versionId')
    version(@Param('artifactId', id) artifactId: string, @Param('versionId', id) versionId: string) {
        return this.inventory.version(artifactId, versionId)
    }
    @Get(':artifactId/draft')
    draft(@Param('artifactId', id) artifactId: string) {
        return this.inventory.draft(artifactId)
    }
}
