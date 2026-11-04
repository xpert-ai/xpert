import { Controller, Get, Param, Post, Body, UseGuards, Query, Put, Delete, BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { ApiTags } from '@nestjs/swagger'
import { CrudController, PaginationParams } from './../core/crud'
import { Tag } from './tag.entity'
import { TagService } from './tag.service'
import { TagManagementService } from './tag-management.service'
import { PermissionGuard, TenantPermissionGuard } from './../shared/guards'
import { IPagination, PermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from './../shared/decorators'
import { ParseJsonPipe, UUIDValidationPipe } from './../shared/pipes'
import { FindOptionsWhere } from 'typeorm'

@ApiTags('Tags')
@UseGuards(TenantPermissionGuard)
@Controller()
export class TagController extends CrudController<Tag> {
	constructor(
		private readonly tagService: TagService,
		private readonly management: TagManagementService
	) {
		super(tagService)
	}

	@Get('directory')
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	directory() {
		return this.management.directory()
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	@Put(':id')
	async update(@Param('id', UUIDValidationPipe) id: string, @Body() input: unknown): Promise<Tag> {
		return this.management.write(input, id)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	@Delete(':id')
	async delete(@Param('id', UUIDValidationPipe) id: string) {
		return this.management.remove(id)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	@Delete(':id/soft')
	async softRemove(): Promise<never> {
		throw new BadRequestException(
			t('server-ai:Error.TagUseStatus', { defaultValue: 'Use tag status to enable or disable a tag.' })
		)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	@Put(':id/recover')
	async softRecover(): Promise<never> {
		throw new BadRequestException(
			t('server-ai:Error.TagUseStatus', { defaultValue: 'Use tag status to enable or disable a tag.' })
		)
	}

	@Get('categories')
	async getAllCategories() {
		return this.tagService.findAllCategories()
	}

	@Get()
	async findAll(): Promise<IPagination<Tag>> {
		return this.tagService.findCatalog()
	}

	// Legacy CRUD reads remain management-only; catalog readers cannot request arbitrary relations.
	@Get('count')
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	override getCount(@Query() options?: FindOptionsWhere<Tag>) {
		return super.getCount(options)
	}

	@Get('pagination')
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	override pagination(filter?: PaginationParams<Tag>) {
		return super.pagination(filter)
	}

	@Get('my')
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	override findMyAll(@Query('data', ParseJsonPipe) params: PaginationParams<Tag>) {
		return super.findMyAll(params)
	}

	@Get(':id')
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	override findById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations?: PaginationParams<Tag>['relations'],
		@Query('$select', ParseJsonPipe) select?: PaginationParams<Tag>['select']
	) {
		return super.findById(id, relations, select)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	@Post()
	async create(@Body() entity: Tag): Promise<Tag> {
		return this.management.write(entity)
	}
}
