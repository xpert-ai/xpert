import {
	Controller,
	HttpStatus,
	Get,
	Query,
	UseGuards,
	HttpCode,
	Delete,
	Param,
	Req,
	UseInterceptors,
	Body,
	Post,
	Put,
	ForbiddenException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CrudController } from './../core/crud';
import { IUserOrganization, RolesEnum, LanguagesEnum, IPagination, PermissionsEnum } from '@metad/contracts';
import { UserOrganizationService } from './user-organization.services';
import { UserOrganization } from './user-organization.entity';
import { Not } from 'typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { UserOrganizationDeleteCommand } from './commands';
import { I18nLang } from 'nestjs-i18n';
import { ParseJsonPipe, UUIDValidationPipe } from './../shared/pipes';
import { PermissionGuard, TenantPermissionGuard } from './../shared/guards';
import { TransformInterceptor } from './../core/interceptors';
import { Permissions } from '../shared/decorators';
import { RequestContext } from '../core/context';

@ApiTags('UserOrganization')
@UseGuards(TenantPermissionGuard)
@UseInterceptors(TransformInterceptor)
@Controller()
export class UserOrganizationController extends CrudController<UserOrganization> {
	constructor(
		private readonly userOrganizationService: UserOrganizationService,
		private readonly commandBus: CommandBus
	) {
		super(userOrganizationService);
	}

	@ApiOperation({ summary: 'Find all UserOrganizations.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found UserOrganizations',
		type: UserOrganization
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(PermissionGuard)
	@Permissions(
		PermissionsEnum.ORG_USERS_VIEW,
		PermissionsEnum.ORG_USERS_EDIT,
		PermissionsEnum.ALL_ORG_VIEW,
		PermissionsEnum.ALL_ORG_EDIT
	)
	@Get()
	async findAll(
		@Query('data', ParseJsonPipe) data: any
	): Promise<IPagination<UserOrganization>> {
		const { relations, findInput } = data;
		this.ensureAccessibleOrganization(findInput?.organizationId)
		return this.userOrganizationService.findAll({
			where: {
				...(findInput ?? {}),
				...(!this.canViewAllOrganizations()
					? { organizationId: this.requireAccessibleOrganizationId(findInput?.organizationId) }
					: {})
			},
			relations
		});
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT, PermissionsEnum.ALL_ORG_EDIT)
	@Post()
	async create(@Body() entity: Partial<UserOrganization>) {
		entity.organizationId = this.requireAccessibleOrganizationId(entity.organizationId)
		return this.userOrganizationService.create(entity)
	}

	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT, PermissionsEnum.ALL_ORG_EDIT)
	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: Partial<IUserOrganization>
	) {
		await this.ensureMembershipAccess(id)
		return this.userOrganizationService.update(id, entity)
	}

	@ApiOperation({ summary: 'Delete user from organization' })
	@ApiResponse({
		status: HttpStatus.NO_CONTENT,
		description: 'The user has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT, PermissionsEnum.ALL_ORG_EDIT)
	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	async delete(
		@Param('id', UUIDValidationPipe) id: string,
		@Req() request,
		@I18nLang() language: LanguagesEnum
	): Promise<IUserOrganization> {
		await this.ensureMembershipAccess(id)
		return this.commandBus.execute(
			new UserOrganizationDeleteCommand({
				userOrganizationId: id,
				requestingUser: request.user,
				language
			})
		);
	}

	@ApiOperation({ summary: 'Find number of Organizations user belongs to' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Count of Organizations given user belongs to',
		type: Number
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(PermissionGuard)
	@Permissions(
		PermissionsEnum.ORG_USERS_VIEW,
		PermissionsEnum.ORG_USERS_EDIT,
		PermissionsEnum.ALL_ORG_VIEW,
		PermissionsEnum.ALL_ORG_EDIT
	)
	@Get(':id')
	async findOrganizationCount(
		@Param('id', UUIDValidationPipe) id: string
	): Promise<number> {
		const membership = await this.ensureMembershipAccess(id)
		const { userId } = membership;
		const { total } = await this.userOrganizationService.findAll({
			where: {
				userId,
				isActive: true,
				user: {
					role: { name: Not(RolesEnum.EMPLOYEE) }
				}
			},
			relations: ['user', 'user.role']
		});
		return total;
	}

	private canViewAllOrganizations() {
		return RequestContext.hasAnyPermission([
			PermissionsEnum.ALL_ORG_VIEW,
			PermissionsEnum.ALL_ORG_EDIT
		])
	}

	private requireAccessibleOrganizationId(organizationId?: string | null) {
		if (this.canViewAllOrganizations()) {
			return organizationId ?? undefined
		}

		const currentOrganizationId = RequestContext.requireOrganizationScope()
		if (organizationId && organizationId !== currentOrganizationId) {
			throw new ForbiddenException('Cross-organization membership access requires tenant-level permissions.')
		}

		return currentOrganizationId
	}

	private ensureAccessibleOrganization(organizationId?: string | null) {
		this.requireAccessibleOrganizationId(organizationId)
	}

	private async ensureMembershipAccess(id: string) {
		const membership = await this.userOrganizationService.findOne(id, {
			relations: ['organization']
		})
		this.ensureAccessibleOrganization(membership.organizationId)
		return membership
	}

	// This was not being used and it overrides the default unnecessarily, so removed until required.
	// Please do not user Get() for findOne and use something like @Get(/organization/id)
	// @ApiOperation({ summary: 'Find one from the search input' })
	// @ApiResponse({ status: HttpStatus.OK, description: 'Found user organization', type: UserOrganization })
	// @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Record not found' })
	// @Get()
	// async findOne(@Query('findInputStr') findInputStr: string): Promise<IUserOrganization> {
	//     const findInput = JSON.parse(findInputStr);
	//     return this.userOrganizationService.findOne({ where: findInput });
	// }
}
