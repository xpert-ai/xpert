import { TChatRequest, TXpertTeamDraft } from '@metad/contracts'
import {
	CrudController,
	OptionParams,
	PaginationParams,
	ParseJsonPipe,
	RequestContext,
	TransformInterceptor,
	UserPublicDTO,
	UseValidationPipe,
	UUIDValidationPipe
} from '@metad/server-core'
import {
	Body,
	Controller,
	Delete,
	Get,
	Header,
	HttpCode,
	HttpStatus,
	Logger,
	Param,
	Post,
	Put,
	Query,
	Sse,
	UseInterceptors,
	UseGuards,
	HttpException
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { DeleteResult } from 'typeorm'
import { XpertAgentExecution } from '../core/entities/internal'
import { FindExecutionsByXpertQuery } from '../xpert-agent-execution/queries'
import { XpertChatCommand, XpertExportCommand, XpertImportCommand } from './commands'
import { XpertDraftDslDTO, XpertPublicDTO } from './dto'
import { Xpert } from './xpert.entity'
import { XpertService } from './xpert.service'
import { WorkspaceGuard } from '../xpert-workspace/'
import { SearchXpertMemoryQuery } from './queries'

@ApiTags('Xpert')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertController extends CrudController<Xpert> {
	readonly #logger = new Logger(XpertController.name)
	constructor(
		private readonly service: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@UseGuards(WorkspaceGuard)
	@Get('by-workspace/:workspaceId')
	async getAllByWorkspace(
		@Param('workspaceId') workspaceId: string,
		@Query('data', ParseJsonPipe) data: PaginationParams<Xpert>,
		@Query('published') published?: boolean
	) {
		const result = await this.service.getAllByWorkspace(workspaceId, data, published, RequestContext.currentUser())
		return {
			...result,
			items: result.items.map((item) => new XpertPublicDTO(item))
		}
	}

	@Get('my')
	async getMyAll(@Query('data', ParseJsonPipe) params: PaginationParams<Xpert>,) {
		return this.service.getMyAll(params)
	}

	@Get('validate')
	async validateTitle(@Query('title') title: string) {
		return this.service.validateTitle(title).then((items) => items.map((item) => new XpertPublicDTO(item)))
	}

	@UseValidationPipe({ transform: true })
	@Post('import')
	async importDSL(@Body() dsl: XpertDraftDslDTO) {
		try {
			return await this.commandBus.execute(new XpertImportCommand(dsl))
		} catch (error) {
			throw new HttpException(
				`An error occurred during import: ${error.message}`,
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	@Get(':xpertId/export')
	async exportDSL(
		@Param('xpertId') xpertId: string,
		@Query('isDraft') isDraft: string,
		@Query('data', ParseJsonPipe) params: PaginationParams<Xpert>) {
		return await this.commandBus.execute(new XpertExportCommand(xpertId, isDraft))
	}

	@Get(':id/team')
	async getTeam(@Param('id') id: string, @Query('data', ParseJsonPipe) data: OptionParams<Xpert>) {
		return this.service.getTeam(id, data)
	}

	@Get(':id/version')
	async allVersions(@Param('id') id: string) {
		return this.service.allVersions(id)
	}

	@Post(':id/draft')
	async saveDraft(@Param('id') id: string, @Body() draft: TXpertTeamDraft) {
		// todo 检查有权限编辑此 xpert role
		draft.savedAt = new Date()
		// Save draft
		return await this.service.saveDraft(id, draft)
	}

	@Put(':id/draft')
	async updateDraft(@Param('id') id: string, @Body() draft: TXpertTeamDraft) {
		// todo 检查有权限编辑此 xpert role
		draft.savedAt = new Date()
		// Save draft
		return await this.service.updateDraft(id, draft)
	}

	@Post(':id/publish')
	async publish(@Param('id') id: string) {
		return this.service.publish(id)
	}

	@Get(':id/executions')
	async getExecutions(
		@Param('id') id: string,
		@Query('$order', ParseJsonPipe) order?: PaginationParams<XpertAgentExecution>['order']
	) {
		return this.queryBus.execute(new FindExecutionsByXpertQuery(id, { order }))
	}

	@Header('content-type', 'text/event-stream')
	@Post(':id/chat')
	@Sse()
	async chat(
		@Param('id') id: string,
		@Body()
		body: {
			request: TChatRequest
			options: {
				isDraft: boolean
			}
		}
	) {
		return await this.commandBus.execute(new XpertChatCommand(body.request, body.options))
	}

	@ApiOperation({ summary: 'Delete record' })
	@ApiResponse({
		status: HttpStatus.NO_CONTENT,
		description: 'The record has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	async delete(@Param('id', UUIDValidationPipe) id: string, ...options: any[]): Promise<Xpert | DeleteResult> {
		// return this.service.deleteXpert(id)
		return this.service.delete(id)
	}

	@Get(':id/managers')
	async getManagers(@Param('id') id: string) {
		const xpert = await this.service.findOne(id, { relations: ['managers'] })
		return xpert.managers.map((u) => new UserPublicDTO(u))
	}

	@Put(':id/managers')
	async updateManagers(@Param('id') id: string, @Body() ids: string[]) {
		return this.service.updateManagers(id, ids)
	}

	@Delete(':id/managers/:userId')
	async removeManager(@Param('id') id: string, @Param('userId') userId: string) {
		await this.service.removeManager(id, userId)
	}

	@Post(':id/memory/search')
	async searchMemory(@Param('id') id: string, @Body() body: {text: string; isDraft?: boolean;}) {
		return this.queryBus.execute(new SearchXpertMemoryQuery(id, body))
	}
}
