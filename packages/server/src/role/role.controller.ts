import { IPagination, PermissionsEnum } from '@xpert-ai/contracts'
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Put,
	Query,
	UseGuards
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CrudController } from './../core/crud'
import { Permissions } from '../shared/decorators'
import { PermissionGuard, TenantPermissionGuard } from './../shared/guards'
import { ParseJsonPipe, UUIDValidationPipe } from './../shared/pipes'
import { Role } from './role.entity'
import { RoleService } from './role.service'
import { DeleteResult, FindOptionsWhere } from 'typeorm'

@ApiTags('Role')
@UseGuards(TenantPermissionGuard)
@Controller()
export class RoleController extends CrudController<Role> {
	constructor(private readonly roleService: RoleService) {
		super(roleService)
	}

	@ApiOperation({ summary: 'Find role.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found role',
		type: Role
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('find')
	async findRole(
		@Query('data', ParseJsonPipe) data: { findInput?: FindOptionsWhere<Role> }
	): Promise<Role> {
		const { findInput } = data
		return this.roleService.findOne({ where: findInput })
	}

	@ApiOperation({ summary: 'Find roles.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found roles.',
		type: Role
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get()
	async findAll(): Promise<IPagination<Role>> {
		return this.roleService.findAll()
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
	@HttpCode(HttpStatus.CREATED)
	@Post()
	override async create(@Body() entity: Partial<Role>): Promise<Role> {
		return super.create(entity)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
	@HttpCode(HttpStatus.ACCEPTED)
	@Put(':id')
	override async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: Partial<Role>
	): Promise<Role> {
		return super.update(id, entity)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	override async delete(@Param('id', UUIDValidationPipe) id: string): Promise<DeleteResult> {
		return super.delete(id)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
	@Delete(':id/soft')
	@HttpCode(HttpStatus.ACCEPTED)
	override async softRemove(@Param('id', UUIDValidationPipe) id: Role['id']): Promise<Role> {
		return super.softRemove(id)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
	@Put(':id/recover')
	@HttpCode(HttpStatus.ACCEPTED)
	override async softRecover(@Param('id', UUIDValidationPipe) id: Role['id']): Promise<Role> {
		return super.softRecover(id)
	}
}
