import {
    buildChunkTree,
    IIntegration,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    IKnowledgeDocumentUpdateInput,
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
	InternalServerErrorException,
	Logger,
	Param,
	ParseBoolPipe,
	Post,
	Put,
	Query,
	Res,
	UseInterceptors
} from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChunkMetadata, RequestContext } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { Queue } from 'bull'
import { In } from 'typeorm'
import type { Response } from 'express'
import archiver from 'archiver'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeDocLoadCommand } from './commands'
import { GetRagWebOptionsQuery } from '../rag-web/queries/'
import { RagWebLoadCommand } from '../rag-web/commands'
import { TVectorSearchParams } from '../knowledgebase'
import { DocumentChunkDTO } from './dto'
import { JOB_EMBEDDING_DOCUMENT } from './types'

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

@ApiTags('KnowledgeDocument')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class KnowledgeDocumentController extends CrudController<KnowledgeDocument> {
	readonly #logger = new Logger(KnowledgeDocumentController.name)

	constructor(
		private readonly service: KnowledgeDocumentService,
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
	async start(@Body() body: { ids: string[] }) {
		return await this.service.startProcessing(body.ids)
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
            const result = await this.commandBus.execute<
                KnowledgeDocLoadCommand,
                { pages: Document<ChunkMetadata>[]; chunks: Document<ChunkMetadata>[] }
            >(new KnowledgeDocLoadCommand({ doc: entity as IKnowledgeDocument, stage: 'test' }))
			return buildChunkTree(result.chunks)
		} catch(err) {
			console.error(err)
			throw new BadRequestException(getErrorMessage(err))
		}
	}

	@Get('status')
	async getStatus(@Query('ids') _ids: string) {
		const ids = _ids.split(',').map((id) => id.trim())
		const {items} = await this.service.findAll({
			select: ['id', 'status', 'progress', 'processMsg'],
			where: {id: In(ids)}
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
		} catch(err) {
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
		try {
            await this.service.updateChunkWithVersion(docId, id, entity)
		} catch (err) {
            throw err
		}
	}

	@Delete(':docId/chunk/:id')
    async deleteChunk(@Param('docId') docId: string, @Param('id') id: string, @Query('version') version: string) {
		try {
            await this.service.deleteChunkWithVersion(docId, id, parseExpectedVersion(version))
		} catch (err) {
            throw err
		}
	}
}
