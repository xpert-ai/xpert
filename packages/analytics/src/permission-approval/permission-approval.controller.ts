import {
	AnalyticsPermissionsEnum,
	IPagination,
	IPermissionApproval,
	IPermissionApprovalCreateInput,
	PermissionApprovalStatus
} from '@xpert-ai/contracts'
import {
	CrudController,
	ParseJsonPipe,
	PermissionGuard,
	Permissions,
	RequestContext,
	TenantPermissionGuard,
	UUIDValidationPipe
} from '@xpert-ai/server-core'
import {
	Body,
	ClassSerializerInterceptor,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Put,
	Query,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PermissionApprovalStatusCommand } from './commands'
import { PermissionApproval } from './permission-approval.entity'
import { PermissionApprovalService } from './permission-approval.service'
import { ApprovalsByProjectQuery } from './queries'

@ApiTags('PermissionApproval')
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(TenantPermissionGuard, PermissionGuard)
@Controller()
export class PermissionApprovalControler extends CrudController<PermissionApproval> {
	constructor(
		private readonly permissionApprovalService: PermissionApprovalService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(permissionApprovalService)
	}

	/**
	 * GET all permission approvals
	 *
	 * @param data
	 * @returns
	 */
	@ApiOperation({ summary: 'Find all permission approvals.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found approvals',
		type: PermissionApproval
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get()
	findAllByProject(
		@Query('project') projectId: string,
		@Query('data', ParseJsonPipe) data: any): Promise<IPagination<PermissionApproval>> {
		return this.queryBus.execute(new ApprovalsByProjectQuery({projectId: projectId === 'null' || projectId === 'undefined' || !projectId ? null : projectId, options: data}))
	}

	/**
	 * GET all request approval by employee
	 *
	 * @param id
	 * @param data
	 * @returns
	 */
	@ApiOperation({ summary: 'Find all permission approval.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found permission approval',
		type: PermissionApproval
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('my')
	findRequestApprovalsByEmployeeId(
		@Query('data', ParseJsonPipe) data: any
	): Promise<IPagination<IPermissionApproval>> {
		const { relations, findInput } = data
		const id = RequestContext.currentUserId()
		return this.permissionApprovalService.findPermissionApprovalsByUserId(id, relations, findInput)
	}

	/**
	 * UPDATE employee accept request approval
	 *
	 * @param id
	 * @returns
	 */
	@ApiOperation({ summary: 'accept request approval.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Approval approval',
		type: PermissionApproval
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Put('approval/:id')
	async approval(@Param('id', UUIDValidationPipe) id: string): Promise<IPermissionApproval> {
		return await this.commandBus.execute(new PermissionApprovalStatusCommand(id, PermissionApprovalStatus.APPROVED))
	}

	/**
	 * UPDATE employee refuse request approval
	 *
	 * @param id
	 * @returns
	 */
	@ApiOperation({ summary: 'refuse request approval.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Refuse approval',
		type: PermissionApproval
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	// @Permissions(AnalyticsPermissionsEnum.PERMISSION_APPROVAL_VIEW)
	@Put('refuse/:id')
	async refuseApproval(@Param('id', UUIDValidationPipe) id: string): Promise<IPermissionApproval> {
		return await this.commandBus.execute(new PermissionApprovalStatusCommand(id, PermissionApprovalStatus.REFUSED))
	}

	/**
	 * CREATE request approval
	 *
	 * @param entity
	 * @returns
	 */
	@ApiOperation({ summary: 'create a permission approval.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Create permission approval',
		type: PermissionApproval
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	//  @Permissions(AnalyticsPermissionsEnum.PERMISSION_APPROVAL_EDIT)
	@Post()
	async create(@Body() entity: IPermissionApprovalCreateInput): Promise<PermissionApproval> {
		return this.permissionApprovalService.createPermissionApproval(entity)
	}

	/**
	 * UPDATE request approval by id
	 *
	 * @param id
	 * @param entity
	 * @returns
	 */
	@ApiOperation({ summary: 'update a request approval.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found policies',
		type: PermissionApproval
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Permissions(AnalyticsPermissionsEnum.PERMISSION_APPROVAL_EDIT)
	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: IPermissionApprovalCreateInput
	): Promise<IPermissionApproval> {
		return this.permissionApprovalService.updatePermissionApproval(id, entity)
	}
}
