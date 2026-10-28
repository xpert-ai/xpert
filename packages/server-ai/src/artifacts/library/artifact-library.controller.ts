import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    Param,
    ParseUUIDPipe,
    ParseIntPipe,
    Post,
    Query,
    Res
} from '@nestjs/common'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import type { Response } from 'express'
import { ArtifactLibraryViewService } from './artifact-library-view.service'
import { artifactPresentationQuerySchema } from '../presentation/artifact-presentation.schema'
import type { ArtifactPresentationQuery } from '@xpert-ai/contracts'

/** Standard login only. Embedded Spaces uses the trusted View capability API. */
@Controller('artifacts/library/:id')
export class ArtifactLibraryController {
    constructor(private readonly views: ArtifactLibraryViewService) {}
    @Get()
    @Header('Cache-Control', 'private, no-store')
    read(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.views.read(id)
    }
    @Post('query')
    @Header('Cache-Control', 'private, no-store')
    query(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Body(new ZodValidationPipe(artifactPresentationQuerySchema, () => new BadRequestException()))
        query: ArtifactPresentationQuery
    ) {
        return this.views.query(id, query)
    }
    @Get('preview')
    async preview(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Res() response: Response,
        @Query('revision', new ParseIntPipe({ optional: true })) revision?: number
    ) {
        this.sendFile(response, await this.views.preview(id, revision))
    }
    @Get('content')
    async content(@Param('id', new ParseUUIDPipe()) id: string, @Res() response: Response) {
        this.sendFile(response, await this.views.download(id))
    }
    private sendFile(response: Response, file: { fileName: string; mimeType: string; buffer: Buffer }) {
        response.setHeader('Cache-Control', 'private, no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'")
        response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
        response.type(file.mimeType).send(file.buffer)
    }
}
