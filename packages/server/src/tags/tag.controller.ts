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
	async findAll(@Query('data', ParseJsonPipe) data: PaginationParams<Tag>): Promise<IPagination<Tag>> {
		const { relations, where } = data ?? {}
		return this.tagService.findAll({
			where,
			relations
		})
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_TAGS_EDIT)
	@Post()
	async create(@Body() entity: Tag): Promise<Tag> {
		return this.management.write(entity)
	}
}
