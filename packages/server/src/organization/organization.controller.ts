import { IOrganization, IOrganizationCreateInput, IPagination, OrgGenerateDemoOptions, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { isNotEmpty } from '@xpert-ai/server-common'
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, InternalServerErrorException, Param, Post, Put, Query, UseGuards, ValidationPipe } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CrudController, PaginationParams } from './../core/crud'
import { RequestContext } from '../core/context'
import { Permissions, Public, Roles } from './../shared/decorators'
import { PermissionGuard, RoleGuard, TenantPermissionGuard } from './../shared/guards'
import { ParseJsonPipe, UUIDValidationPipe } from './../shared/pipes'
import { OrganizationCreateCommand, OrganizationUpdateCommand } from './commands'
import { Organization } from './organization.entity'
import { OrganizationService } from './organization.service'

@ApiTags('Organization')
@Controller()
export class OrganizationController extends CrudController<Organization> {
	constructor(private readonly organizationService: OrganizationService, private readonly commandBus: CommandBus) {
		super(organizationService)
	}

	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT)
	@Get('count')
	async getCount(@Query('data', ParseJsonPipe) data: any): Promise<number> {
		const { findInput } = data ?? {}
		return this.organizationService.count({
			where: findInput
		})
	}

	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT)
	@Get('pagination')
	async pagination(@Query() filter: PaginationParams<Organization>): Promise<IPagination<Organization>> {
		return this.organizationService.paginate(filter)
	}

	@ApiOperation({ summary: 'Find all organizations within the tenant.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found organizations',
		type: Organization
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT)
	@Get()
	async findAll(@Query('data', ParseJsonPipe) data: any): Promise<IPagination<Organization>> {
		const { relations, findInput } = data
		return await this.organizationService.findAll({
			where: findInput,
			relations
		})
	}

	@ApiOperation({ summary: 'Find Organization by id within the tenant.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record',
		type: Organization
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(
		PermissionsEnum.ALL_ORG_VIEW,
		PermissionsEnum.ALL_ORG_EDIT,
		PermissionsEnum.ORG_USERS_VIEW,
		PermissionsEnum.ORG_USERS_EDIT
	)
	@Get(':id')
	async findById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations?: any,
		@Query('$select', ParseJsonPipe) select?: any
	): Promise<IOrganization> {
		this.ensureAccessibleOrganizationId(id)
		return this.organizationService.findOne(id, {
			relations,
			select
		})
	}

	@Get(':id/:select')
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(
		PermissionsEnum.ALL_ORG_VIEW,
		PermissionsEnum.ALL_ORG_EDIT,
		PermissionsEnum.ORG_USERS_VIEW,
		PermissionsEnum.ORG_USERS_EDIT
	)
	async findOneById(
		@Param('id', UUIDValidationPipe) id: string,
		@Param('select', ParseJsonPipe) select: any,
		@Query('data', ParseJsonPipe) data: any
	): Promise<IOrganization> {
		this.ensureAccessibleOrganizationId(id)
		const request = {}
		const { relations } = data
		if (isNotEmpty(select)) {
			request['select'] = select
		}
		if (isNotEmpty(relations)) {
			request['relations'] = relations
		}
		return await this.organizationService.findOne(id, request)
	}

	@ApiOperation({ summary: 'Find Organization by profile link.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record',
		type: Organization
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('profile/:profile_link/:select/:relations')
	@Public()
	async findOneByProfileLink(
		@Param('profile_link') profile_link: string,
		@Param('select') select: string,
		@Param('relations') relations: string
	): Promise<IOrganization> {
		return await this.organizationService.findByPublicLink(profile_link, select, relations)
	}

	@ApiOperation({ summary: 'Create new Organization' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The Organization has been successfully created.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.CREATED)
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_EDIT)
	@Post()
	async create(@Body() entity: IOrganizationCreateInput): Promise<Organization> {
		return await this.commandBus.execute(new OrganizationCreateCommand(entity))
	}

	@ApiOperation({ summary: 'Update existing Organization' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'The Organization has been successfully updated.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.OK)
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_EDIT)
	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: IOrganizationCreateInput,
		...options: any[]
	): Promise<IOrganization> {
		return await this.commandBus.execute(new OrganizationUpdateCommand({ id, ...entity }))
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_EDIT)
	@Delete(':id')
	async delete(@Param('id', UUIDValidationPipe) id: string): Promise<any> {
		return this.organizationService.delete(id)
	}

	@ApiOperation({
		summary: 'Generate demo for organization',
		security: [
			{
				role: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]
			}
		]
	})
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The demo has been successfully generated.'
	})
	@HttpCode(HttpStatus.OK)
	@UseGuards(RoleGuard, TenantPermissionGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL)
	@Post(':id/demo')
	async generateDemo(@Param('id', UUIDValidationPipe) id: string, @Body() body: OrgGenerateDemoOptions) {
		try {
			return await this.organizationService.generateDemo(id, body)
		} catch(err) {
			console.error(err)
			throw new InternalServerErrorException(err.message)
		}
	}

	private canViewAllOrganizations() {
		return RequestContext.hasAnyPermission([
			PermissionsEnum.ALL_ORG_VIEW,
			PermissionsEnum.ALL_ORG_EDIT
		])
	}

	private ensureAccessibleOrganizationId(organizationId: string) {
		if (this.canViewAllOrganizations()) {
			return organizationId
		}

		const currentOrganizationId = RequestContext.requireOrganizationScope()
		if (organizationId !== currentOrganizationId) {
			throw new ForbiddenException('Cross-organization access requires tenant-level permissions.')
		}

		return organizationId
	}
}
