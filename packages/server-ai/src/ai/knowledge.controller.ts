import { IApiKey } from '@metad/contracts'
import { ApiKeyOrClientSecretAuthGuard, ApiKeyDecorator, Public, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Delete, Get, Logger, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger'
import { In } from 'typeorm'
import { KnowledgeDocument } from '../core/entities/internal'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { KnowledgebaseOwnerGuard } from './guards/knowledgebase'
import { CreateKnowledgebaseDTO } from '../knowledgebase/dto'

/**
 * Knowledges APIs for AI (upload documents, embedding etc.)
 */
@ApiTags('AI/Knowledges')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('knowledges')
export class KnowledgesController {
	readonly #logger = new Logger(KnowledgesController.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly kbService: KnowledgebaseService,
		private readonly docService: KnowledgeDocumentService
	) {}

	@Post('')
	@ApiBody({
		type: CreateKnowledgebaseDTO,
		description: 'Knowledgebase'
	})
	async createKnowledgebase(@Body() body: CreateKnowledgebaseDTO) {
		return this.kbService.create(body)
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Put(':id')
	@ApiBody({
		type: CreateKnowledgebaseDTO,
		description: 'Knowledgebase'
	})
	async updateKnowledgebase(@Param('id') id: string, @Body() body: CreateKnowledgebaseDTO) {
		return this.kbService.update(id, body)
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Delete(':id')
	async deleteKnowledgebase(@Param('id') id: string, @ApiKeyDecorator() apiKey: IApiKey) {
		return this.kbService.delete(id)
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Post(':id/bulk')
	@ApiBody({
		type: [KnowledgeDocument],
		description: 'Knowledge documents'
	})
	async createDocBulk(@Param('id') id: string, @Body() entities: KnowledgeDocument[]) {
		return await this.docService.createBulk(entities?.map((entity) => ({ ...entity, knowledgebaseId: id })))
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Post(':id/process')
	async start(@Param('id') id: string, @Body() ids: string[]) {
		return this.docService.startProcessing(ids, id)
	}

	@UseGuards(KnowledgebaseOwnerGuard)
	@Get(':id/status')
	async getStatus(@Query('ids') _ids: string) {
		const ids = _ids.split(',').map((id) => id.trim())
		const { items } = await this.docService.findAll({
			select: ['id', 'status', 'progress', 'processMsg'],
			where: { id: In(ids) }
		})
		return items
	}
}
