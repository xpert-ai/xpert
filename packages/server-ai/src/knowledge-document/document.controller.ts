import { IKnowledgeDocument } from '@metad/contracts'
import { InjectQueue } from '@nestjs/bull'
import {
	Body,
	ClassSerializerInterceptor,
	Controller,
	Delete,
	Get,
	Logger,
	Param,
	Post,
	UseInterceptors,
	Query
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Queue } from 'bull'
import { In } from 'typeorm'
import { CrudController, PaginationParams, ParseJsonPipe, RequestContext, TransformInterceptor } from '@metad/server-core'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'
import { DocumentChunkDTO } from './dto'

@ApiTags('KnowledgeDocument')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class KnowledgeDocumentController extends CrudController<KnowledgeDocument> {
	readonly #logger = new Logger(KnowledgeDocumentController.name)
	constructor(
		private readonly service: KnowledgeDocumentService,
		private readonly commandBus: CommandBus,
		@InjectQueue('embedding-document') private docQueue: Queue
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
		} catch(err) {}

		knowledgeDocument.jobId = null
		knowledgeDocument.status = 'cancel'
		knowledgeDocument.progress = 0

		return await this.service.save(knowledgeDocument)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get(':id/chunk')
	async getChunks(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IKnowledgeDocument>) {
		const result = await this.service.getChunks(id, params)
		return {
			...result,
			items: result.items.map((item) => new DocumentChunkDTO(item))
		}
	}

	@Delete(':docId/chunk/:id')
	async deleteChunk(@Param('docId') docId: string, @Param('id') id: string) {
		await this.service.deleteChunk(docId, id)
	}
}
