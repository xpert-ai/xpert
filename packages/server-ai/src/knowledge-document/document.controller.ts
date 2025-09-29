import { IDocumentChunk, IIntegration, IKnowledgeDocument, isDocumentSheet, KBDocumentCategoryEnum, KBDocumentStatusEnum, TRagWebOptions } from '@metad/contracts'
import {
	CrudController,
	IntegrationService,
	ParseJsonPipe,
	TransformInterceptor
} from '@metad/server-core'
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
	Post,
	Put,
	Query,
	UseInterceptors
} from '@nestjs/common'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChunkMetadata, mergeParentChildChunks } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { Queue } from 'bull'
import { In } from 'typeorm'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeDocLoadCommand } from './commands'
import { GetRagWebOptionsQuery } from '../rag-web/queries/'
import { RagWebLoadCommand } from '../rag-web/commands'
import { TVectorSearchParams } from '../knowledgebase'
import { DocumentChunkDTO } from './dto'
import { JOB_EMBEDDING_DOCUMENT } from './types'

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
	async createBulk(@Body() entities: Partial<IKnowledgeDocument>[]) {
		return await this.service.createBulk(entities)
	}

	@Put('bulk')
	async updateBulk(@Body() entities: Partial<IKnowledgeDocument>[]) {
		return await this.service.updateBulk(entities)
	}

	@Delete('bulk')
	async deleteBulk(@Body('ids') ids: string[]) {
		return await this.service.deleteBulk(ids)
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

	@Post('estimate')
	async estimate(@Body() entity: Partial<IKnowledgeDocument>) {
		try {
			entity.category ??= isDocumentSheet(entity.type) ? KBDocumentCategoryEnum.Sheet : KBDocumentCategoryEnum.Text
			const result = await this.commandBus.execute<KnowledgeDocLoadCommand, { pages: Document<ChunkMetadata>[]; chunks: Document<ChunkMetadata>[] }>(
				new KnowledgeDocLoadCommand({doc: entity as IKnowledgeDocument, stage: 'prod'}))
			return result.pages?.length ? mergeParentChildChunks(result.pages, result.chunks) : result.chunks
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
	async loadRagWeb(@Param('type') type: string, @Body() body: {webOptions: TRagWebOptions; integration: IIntegration}) {
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
		@Param('id') id: string,
		@Query('data', ParseJsonPipe) params: TVectorSearchParams
	) {
		try {
			const result = await this.service.getChunks(id, params)
			return {
				...result,
				items: result.items.map((item) => new DocumentChunkDTO(item))
			}
		} catch (err) {
			throw new InternalServerErrorException(getErrorMessage(err))
		}
	}

	@Post(':id/chunk')
	async createChunk(@Param('id') docId: string, @Body() entity: IDocumentChunk) {
		try {
			return await this.service.createChunk(docId, entity)
		} catch (err) {
			throw new InternalServerErrorException(getErrorMessage(err))
		}
	}

	@Put(':docId/chunk/:id')
	async updateChunk(@Param('docId') docId: string, @Param('id') id: string, @Body() entity: IDocumentChunk) {
		try {
			await this.service.updateChunk(docId, id, entity)
		} catch (err) {
			throw new InternalServerErrorException(getErrorMessage(err))
		}
	}

	@Delete(':docId/chunk/:id')
	async deleteChunk(@Param('docId') docId: string, @Param('id') id: string) {
		try {
			await this.service.deleteChunk(docId, id)
		} catch (err) {
			throw new InternalServerErrorException(getErrorMessage(err))
		}
	}
}
