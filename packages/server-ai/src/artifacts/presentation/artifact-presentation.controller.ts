import { BadRequestException, Body, Controller, Get, Header, Param, Post } from '@nestjs/common'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { artifactPresentationQuerySchema, artifactPresentationSlugSchema } from './artifact-presentation.schema'
import type { ArtifactPresentationQueryInput } from './artifact-presentation.schema'
import { ArtifactPresentationService } from './artifact-presentation.service'

/** Normal login auth only. ChatKit client secrets must use conversation-scoped APIs. */
@Controller('artifacts/shared-links/:slug/presentation')
export class ArtifactPresentationController {
    constructor(private readonly service: ArtifactPresentationService) {}

    @Get()
    @Header('Cache-Control', 'private, no-store')
    read(@Param('slug', new ZodValidationPipe(artifactPresentationSlugSchema, invalidInput)) slug: string) {
        return this.service.read(slug)
    }

    @Post('query')
    @Header('Cache-Control', 'private, no-store')
    query(
        @Param('slug', new ZodValidationPipe(artifactPresentationSlugSchema, invalidInput)) slug: string,
        @Body(new ZodValidationPipe(artifactPresentationQuerySchema, invalidInput))
        input: ArtifactPresentationQueryInput
    ) {
        return this.service.query(slug, input)
    }
}

function invalidInput() {
    return new BadRequestException(
        t('server-ai:Error.ArtifactPresentationInputInvalid', { defaultValue: 'Invalid presentation request.' })
    )
}
