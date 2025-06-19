import { IKnowledgebase, IPagination, IXpertProject, IXpertProjectTask, IXpertToolset, OrderTypeEnum } from '@metad/contracts'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	RequestContext,
	TransformInterceptor,
	UserPublicDTO
} from '@metad/server-core'
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	Logger,
	Param,
	Post,
	Put,
	Query,
	Res,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FindOneOptions } from 'typeorm'
import { ChatConversationPublicDTO } from '../chat-conversation/dto'
import { FindChatConversationQuery } from '../chat-conversation/queries'
import { XpertProjectDto, XpertProjectTaskDto } from './dto'
import { XpertProject } from './entities/project.entity'
import { XpertProjectGuard, XpertProjectOwnerGuard } from './guards'
import { XpertProjectService } from './project.service'
import { XpertProjectFileService } from './services'
import { XpertProjectIdentiDto } from './dto/project-identi.dto'
import { Response } from 'express'
import { environment } from '@metad/server-config'
import { Sandbox } from '../sandbox/client'
import { listFiles } from '../shared'

@ApiTags('XpertProject')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertProjectController extends CrudController<XpertProject> {
	readonly #logger = new Logger(XpertProjectController.name)
	constructor(
		private readonly service: XpertProjectService,
		private readonly fileService: XpertProjectFileService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}

	@ApiOperation({ summary: 'find my all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found my records'
	})
	@Get('my')
	async findAllMyProjects(
		@Query('data', ParseJsonPipe) params: PaginationParams<XpertProject>
	): Promise<IPagination<XpertProjectIdentiDto>> {
		return this.service.findAllMy(params)
	}

	@Get(':id')
	async getXpertProject(@Param('id') id: string, @Query('data', ParseJsonPipe) params: FindOneOptions<XpertProject>) {
		const project = await this.service.findOne(id, params)
		return new XpertProjectDto(project)
	}

	@Post(':id/duplicate')
	async duplicateProject(@Param('id') id: string) {
		const project = await this.service.duplicate(id)
		return new XpertProjectDto(project)
	}

	@Get(':id/xperts')
	async getXperts(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertProject>) {
		return this.service.getXperts(id, params)
	}

	@Put(':id/xperts/:xpert')
	async updateXperts(@Param('id') id: string, @Param('xpert') xpertId: string) {
		return this.service.addXpert(id, xpertId)
	}

	@Delete(':id/xperts/:xpert')
	async removeXpert(@Param('id') id: string, @Param('xpert') xpertId: string) {
		return this.service.removeXpert(id, xpertId)
	}

	@Get(':id/conversations')
	async getConversations(@Param('id') id: string) {
		const { items, total } = await this.queryBus.execute(
			new FindChatConversationQuery(
				{ projectId: id },
				{ relations: ['createdBy'], order: { updatedAt: OrderTypeEnum.DESC } }
			)
		)
		return {
			items: items.map((_) => new ChatConversationPublicDTO(_)),
			total
		}
	}

	@Get(':id/toolsets')
	async getToolsets(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertToolset>) {
		return this.service.getToolsets(id, params)
	}

	@Put(':id/toolsets/:toolset')
	async updateToolsets(@Param('id') id: string, @Param('toolset') toolsetId: string) {
		await this.service.addToolset(id, toolsetId)
	}

	@Delete(':id/toolsets/:toolset')
	async removeToolset(@Param('id') id: string, @Param('toolset') toolsetId: string) {
		await this.service.removeToolset(id, toolsetId)
	}

	@Get(':id/knowledges')
	async getKnowledges(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IKnowledgebase>) {
		return this.service.getKnowledges(id, params)
	}

	@Put(':id/knowledges/:kb')
	async updateKnowledges(@Param('id') id: string, @Param('kb') kbId: string) {
		await this.service.addKnowledge(id, kbId)
	}

	@Delete(':id/knowledges/:kb')
	async removeKnowledge(@Param('id') id: string, @Param('kb') kbId: string) {
		await this.service.removeKnowledgebase(id, kbId)
	}

	@UseGuards(XpertProjectGuard)
	@Get(':id/members')
	async getMembers(@Param('id') id: string) {
		const project = await this.service.findOne(id, { relations: ['members'] })
		return project.members.map((_) => new UserPublicDTO(_))
	}

	@UseGuards(XpertProjectOwnerGuard)
	@Put(':id/members')
	async updateMembers(@Param('id') id: string, @Body() members: string[]) {
		await this.service.updateMembers(id, members)
	}

	@UseGuards(XpertProjectGuard)
	@Get(':id/tasks')
	async getTasks(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertProjectTask>) {
		const { items } = await this.service.getTasks(id, params)
		return items.map((_) => new XpertProjectTaskDto(_))
	}

	@UseGuards(XpertProjectGuard)
	@Delete(':id/file/:file')
	async deleteFile(@Param('id') id: string, @Param('file') fileId: string) {
		await this.fileService.delete(fileId)
	}

	@UseGuards(XpertProjectGuard)
	@Put(':id/attachments')
	async addAttachments(@Param('id') id: string, @Body() files: string[]) {
		await this.service.addAttachments(id, files)
	}

	@UseGuards(XpertProjectGuard)
	@Delete(':id/attachments/:file')
	async removeAttachments(@Param('id') id: string, @Param('file') file: string,) {
		await this.service.removeAttachments(id, [file])
	}

	@UseGuards(XpertProjectGuard)
	@Delete(':id/attachment/:file')
	async deleteAttachment(@Param('id') id: string, @Param('file') file: string,) {
		await this.service.removeAttachments(id, [file])
	}

	@Get(':id/file/:file')
	async readFile(@Param('id') id: string, @Param('file') filePath: string, @Res() res: Response) {
		// read file from project and return as a file stream
		try {
			const file = await this.fileService.readFile(id, filePath)
			if (!file) {
				res.status(HttpStatus.NOT_FOUND).send('File not found')
				return
			}
			res.setHeader('Content-Type', 'text/plain')
			res.setHeader('Content-Disposition', `attachment; filename="${file.filePath}"`)
			res.send(file.contents)
		} catch (error) {
			this.#logger.error(`Error reading file: ${error.message}`, error.stack)
			res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error reading file')
		}
	}

	@UseGuards(XpertProjectGuard)
	@Get(':id/files')
	async readFiles(@Param('id') id: string, @Query('deepth') deepth: number, @Query('path') path: string) {
		if (environment.pro) {
			//
		}
	}
}
