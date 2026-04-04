import { PermissionsEnum } from '@metad/contracts'
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
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CrudController, PaginationParams } from '../core'
import { TransformInterceptor } from '../core/interceptors'
import { Permissions } from '../shared/decorators'
import { PermissionGuard } from '../shared/guards'
import { ParseJsonPipe, UUIDValidationPipe } from '../shared/pipes'
import { UserGroup } from './user-group.entity'
import { UserGroupService } from './user-group.service'

@ApiTags('UserGroup')
@UseInterceptors(TransformInterceptor)
@Controller()
export class UserGroupController extends CrudController<UserGroup> {
	constructor(private readonly service: UserGroupService) {
		super(service)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_VIEW)
	@Get()
	async getAll(
		@Query('data', ParseJsonPipe) data: PaginationParams<UserGroup>,
		@Query('organizationId') organizationId?: string
	) {
		const relations = [...new Set([...(data?.relations ?? []), 'members'])]
		const options = {
			...(data ?? {}),
			relations
		}

		return organizationId
			? this.service.findAllByOrganizationId(organizationId, options)
			: this.service.findAll(options)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_VIEW)
	@Get(':id')
	async getOne(@Param('id', UUIDValidationPipe) id: string) {
		return this.service.findOne(id, {
			relations: ['members']
		})
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT)
	@Post()
	async createOne(@Body() entity: Partial<UserGroup>) {
		return this.service.create(entity)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT)
	@Put(':id')
	async updateOne(@Param('id', UUIDValidationPipe) id: string, @Body() entity: Partial<UserGroup>) {
		await this.service.update(id, entity)
		return this.service.findOne(id, {
			relations: ['members']
		})
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT)
	@Put(':id/members')
	async updateMembers(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() memberIds: string[],
		@Query('organizationId') organizationId?: string
	) {
		return this.service.updateMembers(id, memberIds, organizationId)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT)
	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	async deleteOne(@Param('id', UUIDValidationPipe) id: string) {
		return this.service.delete(id)
	}
}
