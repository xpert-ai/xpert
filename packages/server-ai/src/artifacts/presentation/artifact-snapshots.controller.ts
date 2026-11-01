import { BadRequestException, Controller, Get, Header, Param, Req } from '@nestjs/common'
import { t } from 'i18next'
import { Public, ZodValidationPipe } from '@xpert-ai/server-core'
import type { Request } from 'express'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactSnapshotsService } from './artifact-snapshots.service'
import { artifactPresentationSlugSchema } from './artifact-presentation.schema'

@Controller('artifacts/shared-links/:slug/snapshot')
export class ArtifactSnapshotsController {
    constructor(
        private readonly snapshots: ArtifactSnapshotsService,
        private readonly artifacts: ArtifactsService
    ) {}
    @Public()
    @Get()
    @Header('Cache-Control', 'private, no-store')
    @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
    async read(
        @Param(
            'slug',
            new ZodValidationPipe(
                artifactPresentationSlugSchema,
                () =>
                    new BadRequestException(
                        t('server-ai:Error.ArtifactPresentationInputInvalid', {
                            defaultValue: 'Invalid presentation request.'
                        })
                    )
            )
        )
        slug: string,
        @Req() req: Request
    ) {
        const access = await this.artifacts.resolveAccessContextFromRequest(req)
        return this.snapshots.presentation({ slug, ...access, requestSummary: this.artifacts.summarizeRequest(req) })
    }
}
