import {
    buildChunkTree,
    IIntegration,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    IKnowledgeDocumentUpdateInput,
    KnowledgeDocumentProcessingMode,
    KnowledgeDocumentAnalysisPage,
    KnowledgeDocumentAnalysisPreview,
    KnowledgeDocumentReprocessCapabilities,
    isAudioType,
    isDocumentSheet,
    isImageType,
    isVideoType,
    KBDocumentCategoryEnum,
    KBDocumentStatusEnum,
    TRagWebOptions
} from '@xpert-ai/contracts'
import { CrudController, IntegrationService, ParseJsonPipe, TransformInterceptor } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Head,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    Param,
    ParseBoolPipe,
    ParseIntPipe,
    Post,
    Put,
    Query,
    Req,
    Res,
    UseInterceptors
} from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { Queue } from 'bull'
import { In } from 'typeorm'
import type { Request, Response } from 'express'
import archiver from 'archiver'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeDocLoadCommand } from './commands'
import { GetRagWebOptionsQuery } from '../rag-web/queries/'
import { RagWebLoadCommand } from '../rag-web/commands'
import { TVectorSearchParams } from '../knowledgebase'
import { DocumentChunkDTO } from './dto'
import { JOB_EMBEDDING_DOCUMENT } from './types'
import {
    KnowledgeDocumentTransformSnapshotService,
    TransformSnapshotUnavailableError
} from './transform-snapshot.service'
import { KnowledgeDocumentAnalysisSnapshotService } from './analysis-snapshot.service'
import { resolveKnowledgeDocumentTransformerIdentity } from './document-hash'
import { t } from 'i18next'
import { resolveHttpByteRange } from '../shared'

function parseExpectedVersion(version: unknown) {
    if (typeof version === 'number' && Number.isInteger(version) && version > 0) {
        return version
    }

    if (typeof version === 'string' && version.trim()) {
        const parsed = Number(version)
        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed
        }
    }

    throw new BadRequestException('version is required')
}

function inlineContentDisposition(fileName: string) {
    const fallbackName = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'document'
    const encodedName = encodeURIComponent(fileName).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    return `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`
}

@ApiTags('KnowledgeDocument')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class KnowledgeDocumentController extends CrudController<KnowledgeDocument> {
    readonly #logger = new Logger(KnowledgeDocumentController.name)

    constructor(
        private readonly service: KnowledgeDocumentService,
        private readonly transformSnapshotService: KnowledgeDocumentTransformSnapshotService,
        private readonly analysisSnapshotService: KnowledgeDocumentAnalysisSnapshotService,
        private readonly integrationService: IntegrationService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        @InjectQueue(JOB_EMBEDDING_DOCUMENT) private docQueue: Queue
    ) {
        super(service)
    }

    @Post('bulk')
    async createBulk(
        @Body() entities: Partial<IKnowledgeDocument>[],
        @Query('process', ParseBoolPipe) process?: boolean
    ) {
        entities.forEach((entity) => {
            entity.status = KBDocumentStatusEnum.WAITING
            entity.progress = 0
            entity.processMsg = null
        })
        const result = await this.service.createBulkWithIncrementalSync(entities)
        if (process && result.processableIds.length) {
            await this.service.startProcessing(result.processableIds)
        }
        return result.documents
    }

    /**
     * Update existing documents and re-process it if requested.
     *
     * @param entities
     * @param process
     */
    @Put('bulk')
    async updateBulk(
        @Body() entities: Partial<IKnowledgeDocument>[],
        @Query('process', ParseBoolPipe) process?: boolean
    ) {
        if (process) {
            entities.forEach((entity) => {
                entity.status = KBDocumentStatusEnum.WAITING
                entity.progress = 0
                entity.processMsg = null
            })
        }
        await this.service.updateBulkWithVersion(entities)
        if (process) {
            await this.service.startProcessing(entities.map((doc) => doc.id))
        }
    }

    @Delete('bulk')
    async deleteBulk(@Body() body: { documents?: { id?: string; version?: number }[] }) {
        return await this.service.deleteBulkWithVersion(body.documents ?? [])
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() entity: IKnowledgeDocumentUpdateInput) {
        return await this.service.updateWithVersion(id, entity, parseExpectedVersion(entity.version))
    }

    @Delete(':id')
    async delete(@Param('id') id: string, @Query('version') version: string) {
        return await this.service.deleteWithVersion(id, parseExpectedVersion(version))
    }

    @Post('process')
    async start(@Body() body: { ids: string[]; mode?: KnowledgeDocumentProcessingMode }) {
        return await this.service.startProcessing(body.ids, undefined, parseProcessingMode(body.mode))
    }

    @Get(':id/reprocess-capabilities')
    async getReprocessCapabilities(@Param('id') id: string): Promise<KnowledgeDocumentReprocessCapabilities> {
        const document = await this.service.findOne(id)
        const transformer = document.sourceConfig
            ? (document.metadata?.transformSnapshot?.transformer ??
              resolveKnowledgeDocumentTransformerIdentity(document))
            : resolveKnowledgeDocumentTransformerIdentity(document)
        return await this.transformSnapshotService.inspect(document, transformer)
    }

    @Post('connect')
    async connectDocumentSource(@Body('type') type: string, @Body('config') config: any) {
        return this.service.connectDocumentSource(type, config)
    }

    @Get('preview-file/:id')
    async previewFile(@Param('id') id: string): Promise<Document[]> {
        return await this.service.previewFile(id)
    }

    @Get(':id/original-file/download')
    async downloadOriginalFile(@Param('id') id: string, @Res() res: Response) {
        const file = await this.service.getOriginalFileDownload(id)
        const encodedFilename = encodeURIComponent(file.fileName)
        res.setHeader('Content-Type', file.mimeType)
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        )
        res.send(file.content)
    }

    @Get(':id/analysis-preview')
    async getAnalysisPreview(@Param('id') id: string): Promise<KnowledgeDocumentAnalysisPreview> {
        return await this.analysisSnapshotService.getPreview(await this.service.findOne(id))
    }

    @Get(':id/analysis-preview/pages/:page')
    async getAnalysisPreviewPage(
        @Param('id') id: string,
        @Param('page', ParseIntPipe) page: number
    ): Promise<KnowledgeDocumentAnalysisPage> {
        return await this.analysisSnapshotService.getPage(await this.service.findOne(id), page)
    }

    @Get(':id/analysis-preview/pages/:page/raw')
    async getAnalysisPreviewRawPage(@Param('id') id: string, @Param('page', ParseIntPipe) page: number) {
        return await this.analysisSnapshotService.getRawPage(await this.service.findOne(id), page)
    }

    @Get(':id/analysis-preview/assets/:assetId')
    async getAnalysisPreviewAsset(@Param('id') id: string, @Param('assetId') assetId: string, @Res() res: Response) {
        const target = await this.analysisSnapshotService.resolveAsset(await this.service.findOne(id), assetId)
        res.setHeader('Content-Type', target.mimeType)
        res.setHeader('Content-Disposition', inlineContentDisposition(target.fileName))
        res.setHeader('Cache-Control', 'private, no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        createReadStream(target.absolutePath).pipe(res)
    }

    @Get(':id/original-file/preview')
    previewOriginalFile(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
        return this.streamOriginalFilePreview(id, req, res, false)
    }

    @Head(':id/original-file/preview')
    headOriginalFile(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
        return this.streamOriginalFilePreview(id, req, res, true)
    }

    @Post('original-files/download')
    async downloadOriginalFiles(@Body('ids') ids: string[], @Res() res: Response) {
        const files = await this.service.getOriginalFileDownloads(ids)
        if (!files.length) {
            throw new BadRequestException('No original files are available for download')
        }

        const encodedFilename = encodeURIComponent('knowledge-original-files.zip')
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        )

        const archive = archiver('zip', { zlib: { level: 9 } })
        archive.on('error', (error) => {
            res.destroy(error)
        })
        archive.pipe(res)

        for (const file of files) {
            archive.append(file.content, { name: file.fileName })
        }

        await archive.finalize()
    }

    /**
     * Streams the protected original file with single-range semantics required by PDF.js. Invalid
     * ranges return 416, while HEAD follows the same validation and headers without opening a stream.
     */
    private async streamOriginalFilePreview(id: string, req: Request, res: Response, headOnly: boolean) {
        const target = await this.service.getOriginalFilePreviewTarget(id)
        const fileStat = await stat(target.absolutePath).catch(() => null)
        if (!fileStat?.isFile()) {
            throw new NotFoundException('Original file is not available for this knowledge document')
        }
        const range = resolveHttpByteRange(req.headers.range, fileStat.size)
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Cache-Control', 'private, no-store')
        res.setHeader('Content-Type', target.mimeType)
        res.setHeader('Content-Disposition', inlineContentDisposition(target.fileName))
        res.setHeader('X-Content-Type-Options', 'nosniff')
        if (range.kind === 'unsatisfiable') {
            res.setHeader('Content-Range', `bytes */${fileStat.size}`)
            res.status(416).end()
            return
        }
        const start = range.kind === 'partial' ? range.start : undefined
        const end = range.kind === 'partial' ? range.end : undefined
        const contentLength = range.kind === 'partial' ? range.end - range.start + 1 : fileStat.size
        res.setHeader('Content-Length', contentLength)
        if (range.kind === 'partial') {
            res.status(206)
            res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileStat.size}`)
        }
        if (headOnly) {
            res.end()
            return
        }
        const stream = createReadStream(target.absolutePath, { start, end })
        stream.on('error', (error) => res.destroy(error))
        res.on('close', () => stream.destroy())
        stream.pipe(res)
    }

    @Post('estimate')
    async estimate(@Body() entity: Partial<IKnowledgeDocument>) {
        entity.parserConfig ??= {}
        try {
            entity.category ??= isDocumentSheet(entity.type)
                ? KBDocumentCategoryEnum.Sheet
                : isImageType(entity.type)
                  ? KBDocumentCategoryEnum.Image
                  : isVideoType(entity.type)
                    ? KBDocumentCategoryEnum.Video
                    : isAudioType(entity.type)
                      ? KBDocumentCategoryEnum.Audio
                      : KBDocumentCategoryEnum.Text
            // Reload saved documents so snapshot paths and source identity always come from the
            // tenant-scoped database entity; only the draft parser settings come from the preview.
            const persisted = entity.id ? await this.service.findOne(entity.id) : null
            const previewDocument = persisted
                ? ({ ...persisted, parserConfig: entity.parserConfig } as IKnowledgeDocument)
                : (entity as IKnowledgeDocument)
            let result: { pages: Document<ChunkMetadata>[]; chunks: Document<ChunkMetadata>[] }

            if (persisted) {
                try {
                    // Splitter-only changes should reuse the immutable pre-split converter output.
                    result = await this.loadPreviewDocument(previewDocument, 'rechunk')
                } catch (error) {
                    if (!(error instanceof TransformSnapshotUnavailableError)) {
                        throw error
                    }
                    // Missing, stale, or corrupt snapshots are the only reasons to convert again.
                    // Preview remains read-only because the load command runs in the test stage.
                    result = await this.loadPreviewDocument(previewDocument, 'full')
                }
            } else {
                result = await this.loadPreviewDocument(previewDocument, 'full')
            }
            return buildChunkTree(result.chunks)
        } catch (err) {
            console.error(err)
            throw new BadRequestException(getErrorMessage(err))
        }
    }

    private loadPreviewDocument(document: IKnowledgeDocument, mode: KnowledgeDocumentProcessingMode) {
        return this.commandBus.execute<
            KnowledgeDocLoadCommand,
            { pages: Document<ChunkMetadata>[]; chunks: Document<ChunkMetadata>[] }
        >(new KnowledgeDocLoadCommand({ doc: document, stage: 'test', mode }))
    }

    @Get('status')
    async getStatus(@Query('ids') _ids: string) {
        const ids = _ids.split(',').map((id) => id.trim())
        const { items } = await this.service.findAll({
            select: ['id', 'status', 'progress', 'processMsg'],
            where: { id: In(ids) }
        })
        return items
    }

    @Get('web/:type/options')
    async getWebOptions(@Param('type') type: string) {
        return await this.queryBus.execute(new GetRagWebOptionsQuery(type))
    }

    @Post('web/:type/load')
    async loadRagWeb(
        @Param('type') type: string,
        @Body() body: { webOptions: TRagWebOptions; integration: IIntegration }
    ) {
        if (body.integration) {
            body.integration = await this.integrationService.findOne(body.integration.id)
        }

        try {
            const docs = await this.commandBus.execute(new RagWebLoadCommand(type, body))
            return docs
        } catch (err) {
            throw new InternalServerErrorException(err.message)
        }
    }

    @Delete(':id/job')
    async stopJob(@Param('id') id: string) {
        const knowledgeDocument = await this.service.findOne(id)
        try {
            if (knowledgeDocument.jobId) {
                const job = await this.docQueue.getJob(knowledgeDocument.jobId)
                // cancel job
                // const lockKey = job.lockKey()
                if (job) {
                    await job.discard()
                    await job.moveToFailed({ message: 'Job stopped by user' }, true)
                }
            }
        } catch (err) {
            //
        }

        knowledgeDocument.jobId = null
        knowledgeDocument.status = KBDocumentStatusEnum.CANCEL
        knowledgeDocument.progress = 0

        return await this.service.save(knowledgeDocument)
    }

    @Delete(':id/page/:pageId')
    async deletePage(@Param('id') docId: string, @Param('pageId') id: string) {
        try {
            await this.service.deletePage(docId, id)
        } catch (err) {
            throw new InternalServerErrorException(getErrorMessage(err))
        }
    }

    @UseInterceptors(ClassSerializerInterceptor)
    @Get(':id/chunk')
    async getChunks(
        /**
         * Document ID
         */
        @Param('id') id: string,
        /**
         * Vector Search Params
         */
        @Query('data', ParseJsonPipe) params: TVectorSearchParams
    ) {
        try {
            const result = await this.service.getChunks(id, params)
            return {
                ...result,
                items: result.items.map((item) => new DocumentChunkDTO(item))
            }
        } catch (err) {
            console.error(err)
            throw new InternalServerErrorException(getErrorMessage(err))
        }
    }

    @Post(':id/chunk')
    async createChunk(
        /**
         * Document ID
         */
        @Param('id') docId: string,
        /**
         * Chunk info
         */
        @Body() entity: IKnowledgeDocumentChunk
    ) {
        try {
            return await this.service.createChunk(docId, entity)
        } catch (err) {
            throw new InternalServerErrorException(getErrorMessage(err))
        }
    }

    @Put(':docId/chunk/:id')
    async updateChunk(@Param('docId') docId: string, @Param('id') id: string, @Body() entity: IKnowledgeDocumentChunk) {
        await this.service.updateChunkWithVersion(docId, id, entity)
    }

    @Delete(':docId/chunk/:id')
    async deleteChunk(@Param('docId') docId: string, @Param('id') id: string, @Query('version') version: string) {
        await this.service.deleteChunkWithVersion(docId, id, parseExpectedVersion(version))
    }
}

function parseProcessingMode(mode: unknown): KnowledgeDocumentProcessingMode {
    if (mode === undefined || mode === null || mode === 'full') {
        return 'full'
    }
    if (mode === 'rechunk') {
        return mode
    }
    throw new BadRequestException(
        t('server-ai:Error.InvalidDocumentProcessingMode', {
            defaultValue: 'Document processing mode must be full or rechunk.'
        })
    )
}
