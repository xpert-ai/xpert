import { IDocumentChunk, IIntegration, IKnowledgeDocument, isDocumentSheet, KBDocumentCategoryEnum, TRagWebOptions } from '@metad/contracts'
import {
	CrudController,
	IntegrationService,
	ParseJsonPipe,
	RequestContext,
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
import { Document } from 'langchain/document'
import { Queue } from 'bull'
import { In } from 'typeorm'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'
import { DocumentChunkDTO } from './dto'
import { KnowledgeDocLoadCommand } from './commands'
import { GetRagWebOptionsQuery } from '../rag-web/queries/'
import { RagWebLoadCommand } from '../rag-web/commands'
import { TVectorSearchParams } from '../knowledgebase'
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

	@Post('process')
	async start(@Body() body: { ids: string[] }) {
		const userId = RequestContext.currentUserId()
		const { items } = await this.service.findAll({
			where: {
				id: In(body.ids)
			}
		})

		const docs = items.filter((doc) => doc.status !== 'running')

		const job = await this.docQueue.add({
			userId,
			docs
		})

		docs.forEach((item) => {
			item.jobId = job.id as string
			item.status = 'running'
			item.processMsg = ''
			item.progress = 0
		})

		return await this.service.save(docs)
	}

	@Get('preview-file/:id') 
	async previewFile(@Param('id') id: string): Promise<Document[]> {
		return await this.service.previewFile(id)
	}

	@Post('estimate')
	async estimate(@Body() entity: Partial<IKnowledgeDocument>) {
		try {
			entity.category ??= isDocumentSheet(entity.type) ? KBDocumentCategoryEnum.Sheet : KBDocumentCategoryEnum.Text
			return await this.commandBus.execute(new KnowledgeDocLoadCommand({doc: entity as IKnowledgeDocument}))
		} catch(err) {
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
		knowledgeDocument.status = 'cancel'
		knowledgeDocument.progress = 0

		return await this.service.save(knowledgeDocument)
	}

	@Delete(':id/page/:pageId')
	async deletePage(@Param('id') docId: string, @Param('pageId') id: string) {
		await this.service.deletePage(docId, id)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get(':id/chunk')
	async getChunks(
		@Param('id') id: string,
		@Query('data', ParseJsonPipe) params: TVectorSearchParams
	) {
		const result = await this.service.getChunks(id, params)
		return {
			...result,
			items: result.items.map((item) => new DocumentChunkDTO(item))
		}
	}

	@Post(':id/chunk')
	async createChunk(@Param('id') docId: string, @Body() entity: IDocumentChunk) {
		return await this.service.createChunk(docId, entity)
	}

	@Put(':docId/chunk/:id')
	async updateChunk(@Param('docId') docId: string, @Param('id') id: string, @Body() entity: IDocumentChunk) {
		await this.service.updateChunk(docId, id, entity)
	}

	@Delete(':docId/chunk/:id')
	async deleteChunk(@Param('docId') docId: string, @Param('id') id: string) {
		await this.service.deleteChunk(docId, id)
	}
	
}
