import { RolesEnum } from '@metad/contracts'
import { DeepPartial } from '@metad/server-common'
import {
	CrudController,
	PaginationParams,
	ParseJsonPipe,
	RequestContext,
	RoleGuard,
	Roles,
	TransformInterceptor
} from '@metad/server-core'
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
import { XpertWorkspaceDTO } from './dto'
import { Not } from 'typeorm'

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

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN)
	@Get()
	async findAllWorkspaces(@Query('data', ParseJsonPipe) options: PaginationParams<XpertWorkspace>) {
		return this.service.findAll(options)
	}

	@Get('my')
	async findAllMy(@Query('data', ParseJsonPipe) options: PaginationParams<XpertWorkspace>) {
		return this.service.findAllMy(options)
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
