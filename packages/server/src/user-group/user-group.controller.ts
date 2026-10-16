import { PermissionsEnum } from '@xpert-ai/contracts'
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
import {
	UserGroupCreateInput,
	UserGroupUpdateInput,
	userGroupCreateSchema,
	userGroupMemberIdsSchema,
	userGroupUpdateSchema,
	userGroupValidationPipe
} from './user-group.schema'

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
	@Get('member-candidates')
	async getMemberCandidates(@Query('organizationId') organizationId?: string) {
		return this.service.findMemberCandidates(organizationId)
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
	override async create(@Body(userGroupValidationPipe(userGroupCreateSchema)) entity: UserGroupCreateInput) {
		return this.service.create(entity)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT)
	@Put(':id')
	override async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body(userGroupValidationPipe(userGroupUpdateSchema)) entity: UserGroupUpdateInput
	) {
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
		@Body(userGroupValidationPipe(userGroupMemberIdsSchema)) memberIds: string[],
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
