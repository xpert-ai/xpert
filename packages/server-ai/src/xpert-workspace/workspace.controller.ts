import { AIPermissionsEnum, TXpertWorkspaceVisibility } from '@xpert-ai/contracts'
import { DeepPartial } from '@xpert-ai/server-common'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	RequestContext,
	TransformInterceptor
} from '@xpert-ai/server-core'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	Query,
	UseGuards,
	UseInterceptors,
	Param,
	Put,
	Delete
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { XpertWorkspace } from './workspace.entity'
import { XpertWorkspaceService } from './workspace.service'
import { WorkspaceGuard } from './guards/workspace.guard'
import { WorkspaceOwnerGuard } from './guards/workspace-owner.guard'
import { WorkspacePublicDTO, XpertWorkspaceDTO } from './dto'

@ApiTags('XpertWorkspace')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertWorkspaceController extends CrudController<XpertWorkspace> {
	readonly #logger = new Logger(XpertWorkspaceController.name)
	constructor(
		private readonly service: XpertWorkspaceService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@UseGuards(PermissionGuard)
	@Permissions(AIPermissionsEnum.XPERT_EDIT)
	@Get()
	async findAllWorkspaces(@Query('data', ParseJsonPipe) options: PaginationParams<XpertWorkspace>) {
		return this.service.findAll(options)
	}

	@Get('my')
	async findAllMy(@Query('data', ParseJsonPipe) options: PaginationParams<XpertWorkspace>) {
		return this.service.findAllMy(options)
	}

	@Get('my/default')
	async findMyDefault() {
		const workspace = await this.service.findMyDefault()
		return workspace ? new WorkspacePublicDTO(workspace) : null
	}

	@Post(':workspaceId/default')
	async setMyDefault(@Param('workspaceId') workspaceId: string) {
		return new WorkspacePublicDTO(await this.service.setMyDefault(workspaceId))
	}

	@ApiOperation({ summary: 'Create new record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created.' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.CREATED)
	@Post()
	async create(@Body() entity: DeepPartial<XpertWorkspace>): Promise<XpertWorkspace> {
		entity.ownerId = RequestContext.currentUserId()
		return this.service.create(entity)
	}

	@UseGuards(WorkspaceGuard)
	@Get(':workspaceId')
	async getOne(@Param('workspaceId') workspaceId: string, @Query('data', ParseJsonPipe) options: PaginationParams<XpertWorkspace>) {
		return this.service.findOne(workspaceId, options)
	}

	@UseGuards(WorkspaceGuard)
	@Get(':workspaceId/members')
	async getMembers(@Param('workspaceId') workspaceId: string) {
		const workspace = await this.service.findOne(workspaceId, { relations: ['members'] })
		return workspace.members
	}
	
	@UseGuards(WorkspaceOwnerGuard)
	@Put(':workspaceId/members')
	async updateMembers(@Param('workspaceId') id: string, @Body() members: string[]) {
		const workspace = await this.service.updateMembers(id, members)
		return new XpertWorkspaceDTO(workspace)
	}

	@UseGuards(WorkspaceOwnerGuard)
	@Put(':workspaceId/visibility')
	async updateVisibility(
		@Param('workspaceId') id: string,
		@Body('visibility') visibility: TXpertWorkspaceVisibility
	) {
		const workspace = await this.service.updateVisibility(id, visibility)
		return new WorkspacePublicDTO(workspace)
	}

	@UseGuards(WorkspaceOwnerGuard)
	@Delete(':workspaceId')
	async delete(@Param('workspaceId') id: string,) {
		return await this.service.delete(id)
	}

	@UseGuards(WorkspaceOwnerGuard)
	@Post(':workspaceId/archive')
	async archive(@Param('workspaceId') id: string,) {
		return await this.service.update(id, { status: 'archived' })
	}
}
