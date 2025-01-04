import {
	IPagination,
	IRolePermission,
	IRolePermissionCreateInput,
	PermissionsEnum
} from '@metad/contracts';
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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdateResult } from 'typeorm';
import { CrudController } from './../core/crud';
import { Permissions } from './../shared/decorators';
import { PermissionGuard, TenantPermissionGuard } from './../shared/guards';
import { ParseJsonPipe, UUIDValidationPipe } from './../shared/pipes';
import { RolePermission } from './role-permission.entity';
import { RolePermissionService } from './role-permission.service';

@ApiTags('Role')
@UseGuards(TenantPermissionGuard, PermissionGuard)
@Permissions(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
@Controller()
export class RolePermissionController extends CrudController<RolePermission> {
	constructor(
		private readonly rolePermissionService: RolePermissionService
	) {
		super(rolePermissionService);
	}

	// @ApiResponse({
	// 	status: HttpStatus.CREATED,
	// 	description: 'Role Permissions have been successfully imported.'
	// })
	// @ApiResponse({
	// 	status: HttpStatus.BAD_REQUEST,
	// 	description: 'Invalid input, The request body may contain clues as to what went wrong'
	// })
	// @UseGuards(PermissionGuard)
	// @Post('import/migrate')
	// async importRole(
	// 	@Body() input: any
	// ) {
	// 	return await this.rolePermissionService.migrateImportRecord(input);
	// }

	@ApiOperation({ summary: 'Find role permissions.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found role permissions.',
		type: RolePermission
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get()
	async findAll(
		@Query('data', ParseJsonPipe) data: any
	): Promise<IPagination<RolePermission>> {
		const { findInput } = data;
		return this.rolePermissionService.findAll({ where: findInput });
	}

	@ApiOperation({ summary: 'Create new record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.CREATED)
	@Post()
	async create(
		@Body() entity: IRolePermissionCreateInput
	): Promise<RolePermission> {
		return this.rolePermissionService.create(entity);
	}

	@ApiOperation({ summary: 'Update an existing record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully edited.'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: RolePermission
	): Promise<UpdateResult | IRolePermission> {
		return await this.rolePermissionService.updatePermission(id, entity);
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	async delete(
		@Param('id', UUIDValidationPipe) id: string
	): Promise<any> {
		return await this.rolePermissionService.deletePermission(id);
	}
}