import { IChatConversation, ICopilotStore, IIntegration, LanguagesEnum, OrderTypeEnum, RolesEnum, TChatApi, TChatApp, TChatOptions, TChatRequest, TXpertTeamDraft, UserType, xpertLabel } from '@metad/contracts'
import {
	CrudController,
	OptionParams,
	PaginationParams,
	ParseJsonPipe,
	RequestContext,
	RoleGuard,
	Roles,
	TransformInterceptor,
	UserPublicDTO,
	UseValidationPipe,
	UUIDValidationPipe,
	UserCreateCommand,
	Public,
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
	HttpException,
	ForbiddenException
} from '@nestjs/common'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { Between, DeleteResult, FindConditions, In, IsNull, Like, Not } from 'typeorm'
import { I18nLang } from 'nestjs-i18n'
import { v4 as uuidv4 } from 'uuid'
import { ChatConversation, XpertAgentExecution } from '../core/entities/internal'
import { FindExecutionsByXpertQuery } from '../xpert-agent-execution/queries'
import { XpertChatCommand, XpertDelIntegrationCommand, XpertExportCommand, XpertImportCommand, XpertPublishIntegrationCommand } from './commands'
import { XpertDraftDslDTO, XpertPublicDTO } from './dto'
import { Xpert } from './xpert.entity'
import { XpertService } from './xpert.service'
import { WorkspaceGuard } from '../xpert-workspace/'
import { SearchXpertMemoryQuery } from './queries'
import { CopilotStoreService } from '../copilot-store/copilot-store.service'
import { XpertAgentVariablesQuery } from '../xpert-agent/queries'
import { AnonymousXpertAuthGuard } from './auth/anonymous-auth.guard'
import { ChatConversationDeleteCommand, ChatConversationLogsQuery, ChatConversationUpsertCommand, FindChatConversationQuery, GetChatConversationQuery, StatisticsAverageSessionInteractionsQuery, StatisticsDailyConvQuery, StatisticsDailyEndUsersQuery, StatisticsDailyMessagesQuery } from '../chat-conversation'
import { FindMessageFeedbackQuery } from '../chat-message-feedback/queries'
import { XpertGuard } from './guards/xpert.guard'
import { ChatConversationPublicDTO } from '../chat-conversation/dto'

@ApiTags('Xpert')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertController extends CrudController<Xpert> {
	readonly #logger = new Logger(XpertController.name)
	constructor(
		private readonly service: XpertService,
		private readonly storeService: CopilotStoreService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get()
	async getAll(@Query('data', ParseJsonPipe) params: Partial<PaginationParams<Xpert>>, @Query('published') published?: boolean) {
		const { where, ...rest } = params
		if (published) {
			where.version = Not(IsNull())
		}
		
		const result = await this.service.findAll({...rest, where})
		return {
			...result,
			items: result.items.map((item) => new XpertPublicDTO(item))
		}
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
	async validateName(@Query('name') name: string) {
		return this.service.validateName(name)
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
	
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get('select-options')
	async getSelectOptions() {
		const { items } = await this.getAll({where: {latest: true, }}, true, )
		return items.map((item) => ({
			value: item.id,
			label: xpertLabel(item)
		}))
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

	@UseGuards(XpertGuard)
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

	@Post(':id/publish/integration')
	async publishIntegration(@Param('id') id: string, @Body() integration: Partial<IIntegration>) {
		return this.commandBus.execute(new XpertPublishIntegrationCommand(id, integration))
	}

	@Delete(':id/publish/integration/:integration')
	async deleteIntegration(@Param('id') id: string, @Param('integration') integration: string,) {
		return this.commandBus.execute(new XpertDelIntegrationCommand(id, integration))
	}

	@Get(':id/executions')
	async getExecutions(
		@Param('id') id: string,
		@Query('$order', ParseJsonPipe) order?: PaginationParams<XpertAgentExecution>['order']
	) {
		return this.queryBus.execute(new FindExecutionsByXpertQuery(id, { order }))
	}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Header('Cache-Control', 'no-cache')
	@Post(':id/chat')
	@Sse()
	async chat(
		@Param('id') id: string,
		@I18nLang() language: LanguagesEnum,
		@Body()
		body: {
			request: TChatRequest
			options: {
				isDraft: boolean
			}
		}
	) {
		return await this.commandBus.execute(new XpertChatCommand(body.request, {...body.options, language }))
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

	@Get(':id/memory')
	async getAllMemory(@Param('id') id: string, @Query('types') types: string) {
		const where = {} as FindConditions<ICopilotStore>
		const _types = types?.split(':')
		if (_types?.length > 1) {
			where.prefix = In(_types.map((type) => `${id}${type ? `:${type}` : ''}`))
		} else if(_types?.length === 1) {
			const type = _types[0]
			where.prefix = `${id}${type ? `:${type}` : ''}`
		} else {
			where.prefix = Like(`${id}%`)
		}

		try {
			return await this.storeService.findAll({where, relations: ['createdBy'], order: {createdAt: OrderTypeEnum.DESC}})
		} catch(err) {
			throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Post(':id/memory/search')
	async searchMemory(@Param('id') id: string, @Body() body: {text: string; isDraft?: boolean;}) {
		try {
			return await this.queryBus.execute(new SearchXpertMemoryQuery(id, body))
		} catch(err) {
			throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Delete(':id/memory')
	async clearMemory(@Param('id') id: string,) {
		try {
			return await this.storeService.delete({prefix: Like(`${id}%`)})
		} catch(err) {
			throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Get(':id/agent/:agent/variables')
	async getVariables(@Param('id') id: string, @Param('agent') agentKey: string,) {
		try {
			return await this.queryBus.execute(new XpertAgentVariablesQuery(id, agentKey, true))
		} catch (err) {
			throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}

	@Put(':id/api')
	async updateChatApi(@Param('id') id: string, @Body() api: Partial<TChatApi>) {
		const xpert = await this.service.findOne(id)
		await this.service.update(id, {api: {...(xpert.api ?? {}), ...api}})
		if (!api.disabled && !xpert.userId) {
			const user = await this.commandBus.execute(new UserCreateCommand({
				username: xpert.slug,
				type: UserType.COMMUNICATION,
				preferredLanguage: LanguagesEnum.English,
				hash: uuidv4(),
			}))
			await this.service.update(id, {user})
		}
	}

	@Put(':id/app')
	async updateChatApp(@Param('id') id: string, @Body() app: Partial<TChatApp>) {
		const xpert = await this.service.findOne(id)
		await this.service.update(id, {app: {...(xpert.app ?? {}), ...app}})
		if (app.enabled && !xpert.userId) {
			const user = await this.commandBus.execute(new UserCreateCommand({
				username: xpert.slug,
				type: UserType.COMMUNICATION,
				preferredLanguage: LanguagesEnum.English,
				hash: uuidv4(),
			}))
			await this.service.update(id, {user})
		}
	}

	// Conversations

	@UseGuards(XpertGuard)
	@Get(':id/conversations')
	async getConversations(
		@Param('id') id: string,
		@Query('data', ParseJsonPipe) data: PaginationParams<ChatConversation>,
		@Query('start') start: string,
		@Query('end') end: string
	) {
		const {where} = data
		const result = await this.queryBus.execute(new ChatConversationLogsQuery(
			{
				...data,
				where: {
					...(where ?? {}),
					xpertId: id,
					createdAt: Between(start, end)
				},
			},
		))
		return {
			...result,
			items: result.items.map((item) => new ChatConversationPublicDTO(item))
		}
	}

	// Public App

	@Public()
	@UseGuards(AnonymousXpertAuthGuard)
	@Get(':name/app')
	async getChatApp(@Param('name') name: string,) {
		const xpert = await this.service.findBySlug(name)
		if (!xpert.app?.enabled) {
			throw new ForbiddenException(name)
		}

		return new XpertPublicDTO(xpert)
	}

	@Public()
	@UseGuards(AnonymousXpertAuthGuard)
	@Get(':name/conversation/:id')
	async getAppConversation(@Param('name') name: string, @Param('id') id: string,
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<ChatConversation>['relations'],
		@Query('$select', ParseJsonPipe) select?: PaginationParams<ChatConversation>['select'],
	) {
		const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
		const conversation = await this.queryBus.execute(new GetChatConversationQuery({id, fromEndUserId}, relations))
		return conversation
	}

	@Public()
	@UseGuards(AnonymousXpertAuthGuard)
	@Delete(':name/conversation/:id')
	async deleteAppConversation(@Param('name') name: string, @Param('id') id: string,) {
		const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
		await this.queryBus.execute(new GetChatConversationQuery({id, fromEndUserId}))
		await this.commandBus.execute(new ChatConversationDeleteCommand({id, fromEndUserId}))
	}

	@Public()
	@UseGuards(AnonymousXpertAuthGuard)
	@Get(':name/conversation')
	async getAppConversations(@Param('name') name: string,
		@Query('data', ParseJsonPipe) paginationOptions?: PaginationParams<ChatConversation>,
	) {
		const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
		const conversation = await this.queryBus.execute(new FindChatConversationQuery({fromEndUserId}, paginationOptions))
		return conversation
	}

	@Public()
	@UseGuards(AnonymousXpertAuthGuard)
	@Put(':name/conversation/:id')
	async updateAppConversation(@Param('name') name: string, @Param('id') id: string, @Body() entity: Partial<IChatConversation>) {
		const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
		await this.queryBus.execute(new FindChatConversationQuery({id, fromEndUserId}))
		await this.commandBus.execute(new ChatConversationUpsertCommand({
			id,
			...entity
		}))
	}

	@Public()
	@UseGuards(AnonymousXpertAuthGuard)
	@Get(':name/conversation/:id/feedbacks')
	async getAppFeedbacks(@Param('name') name: string, @Param('id') id: string,
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<ChatConversation>['relations'],
		@Query('$select', ParseJsonPipe) select?: PaginationParams<ChatConversation>['select'],
	) {
		const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
		const conversation = await this.queryBus.execute(new FindChatConversationQuery({id, fromEndUserId}, {relations}))
		return await this.queryBus.execute(new FindMessageFeedbackQuery({conversationId: conversation.id}, relations))
	}

	@Public()
	@UseGuards(AnonymousXpertAuthGuard)
	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post(':name/chat-app')
	@Sse()
	async chatApp(@Param('name') name: string, @I18nLang() language: LanguagesEnum, @Body() body: { request: TChatRequest; options: TChatOptions }) {
		const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
		return await this.commandBus.execute(new XpertChatCommand(body.request, {...body.options, language, fromEndUserId }))
	}

	// Statistics

	@UseGuards(XpertGuard)
	@Get(':id/statistics/daily-conversations')
	async getDailyConversations(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsDailyConvQuery(id, start, end))
	}

	@UseGuards(XpertGuard)
	@Get(':id/statistics/daily-end-users')
	async getDailyEndUsers(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsDailyEndUsersQuery(id, start, end))
	}
	
	@UseGuards(XpertGuard)
	@Get(':id/statistics/average-session-interactions')
	async getAverageSessionInteractions(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsAverageSessionInteractionsQuery(id, start, end))
	}

	@UseGuards(XpertGuard)
	@Get(':id/statistics/daily-messages')
	async getDailyMessages(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
		return await this.queryBus.execute(new StatisticsDailyMessagesQuery(id, start, end))
	}

}
