import { BusinessAreaRole, IPagination, RolesEnum } from '@xpert-ai/contracts'
import { CrudController, ParseJsonPipe, RoleGuard, Roles, TenantPermissionGuard } from '@xpert-ai/server-core'
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { BusinessAreaUser } from './business-area-user.entity'
import { BusinessAreaUserService } from './business-area-user.service'


@ApiTags('BusinessAreaUser')
@UseGuards(TenantPermissionGuard)
@Controller()
export class BusinessAreaUserController extends CrudController<BusinessAreaUser> {
	constructor(
		private readonly bauService: BusinessAreaUserService,
		private readonly commandBus: CommandBus
	) {
		super(bauService)
	}

	@ApiOperation({ summary: 'Find all UserBusinessAreas.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found UserBusinessAreas',
		type: BusinessAreaUser
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL)
	@Get()
	async findAll(@Query('data', ParseJsonPipe) data: any): Promise<IPagination<BusinessAreaUser>> {
		const { relations, findInput } = data
		return this.bauService.findAll({
			where: findInput,
			relations
		})
	}

	@ApiOperation({ summary: 'Find My UserBusinessAreas.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found My UserBusinessAreas',
		type: BusinessAreaUser
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('my')
	async getMy(@Query('data', ParseJsonPipe) data: any): Promise<IPagination<BusinessAreaUser>> {
		const { relations, findInput } = data
		return this.bauService.findMy({
			where: findInput,
			relations
		})
	}

	@ApiOperation({ summary: 'Create new record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created.' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.CREATED)
	@Post(':id')
	async createBulk(
		@Param('id') id: string,
		@Body() users: {id: string, role: BusinessAreaRole}[],
		...options: any[]
	): Promise<BusinessAreaUser[]> {
		return this.bauService.createBulk(id, users)
	}
}
