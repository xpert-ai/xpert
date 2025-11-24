import { DEFAULT_TENANT, IPagination, ITenant, ITenantCreateInput, RolesEnum } from '@metad/contracts';
import { Request } from 'express';
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	HttpCode,
	HttpStatus,
	MethodNotAllowedException,
	Param,
	Post,
	Put,
	Req,
	UseGuards
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UUIDValidationPipe } from './../shared/pipes';
import { RequestContext } from '../core/context';
import { CrudController } from './../core/crud';
import { Public, Roles } from './../shared/decorators';
import { RoleGuard, TenantPermissionGuard } from './../shared/guards';
import { Tenant } from './tenant.entity';
import { TenantService } from './tenant.service';
import { UserCreateCommand } from '../user/commands';
import { FeatureBulkCreateCommand } from '../feature/commands';
import { LanguageInitCommand } from '../language/commands';

@ApiTags('Tenant')
@Controller()
export class TenantController extends CrudController<Tenant> {
	constructor(
		private readonly tenantService: TenantService,
		private readonly commandBus: CommandBus) {
		super(tenantService);
	}

	@Get('count')
	async getCount() {
		throw new MethodNotAllowedException();
	}

	@Get('pagination')
	async pagination() {
		throw new MethodNotAllowedException();
	}

	@ApiOperation({
		summary: 'Find all tenants of the user' 
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found tenants',
		type: Tenant
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(RoleGuard, TenantPermissionGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@Get()
	async findAll(): Promise<IPagination<Tenant>> {
		const tenantId = RequestContext.currentTenantId();
		return this.tenantService.findAll({
			where: {
				id: tenantId
			}
		});
	}

	/**
	 * @changed add onboarding info api
	 * @returns 
	 */
	@Public()
	@HttpCode(HttpStatus.OK)
	@Get('onboard')
	async getOnboardDefault(@Req() request: Request): Promise<ITenant> {
		const name = request['tenant-domain'] || DEFAULT_TENANT
		let tenant = await this.tenantService.findOneOrFailByOptions({
			where: {
				name
			},
			relations: [ 'settings' ]
		})
		if (!tenant.success) {
			tenant = await this.tenantService.findOneOrFailByOptions({
				where: {
					name: DEFAULT_TENANT
				},
				relations: [ 'settings' ]
			})
		}

		return tenant.success ? {
			...tenant.record,
			settings: tenant.record.settings.filter((item) => item.name?.startsWith('tenant'))
		} : null
	}

	@ApiOperation({ summary: 'Find by id' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(RoleGuard, TenantPermissionGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@Get(':id')
	async findById(
		@Param('id', UUIDValidationPipe) id: string
	): Promise<Tenant> {
		const tenantId = RequestContext.currentTenantId();
		if (id !== tenantId) {
			throw new ForbiddenException();
		}
		return this.tenantService.findOne(tenantId);
	}

	/**
	 * CREATE Owner Tenant
	 *
	 * @returns
	 */
	@ApiOperation({
		summary: 'Create new tenant. The user who creates the tenant is given the super admin role.',
		security: [
			{
				role: [RolesEnum.SUPER_ADMIN]
			}
		]
	})
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
	async create(@Body() entity: ITenantCreateInput): Promise<Tenant> {
		const user = RequestContext.currentUser();
		if (user.tenantId || user.roleId) {
			throw new BadRequestException('Tenant already exists');
		}
		return await this.tenantService.onboardTenant(entity, user);
	}

	@ApiOperation({
		summary:
			'Create new tenant. The user who creates the tenant is given the super admin role.'
	})
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@Public()
	@HttpCode(HttpStatus.CREATED)
	@Post('onboard')
	async onboardDefault(@Body() entity: ITenantCreateInput): Promise<Tenant> {
		const defaultTenant = await this.tenantService.findOneOrFailByWhereOptions({name: entity.name})
		if (defaultTenant.success) {
			throw new BadRequestException('Tenant already exists');
		}
		await this.commandBus.execute(new LanguageInitCommand())
		await this.commandBus.execute(new FeatureBulkCreateCommand())
		const user = await this.commandBus.execute(new UserCreateCommand(entity.superAdmin))
		return await this.tenantService.onboardTenant(entity, user);
	}

	@ApiOperation({
		summary:
			'Update existin tenant. The user who updates the tenant is given the super admin role.'
	})
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully updated.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.OK)
	@UseGuards(RoleGuard, TenantPermissionGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: ITenantCreateInput
	): Promise<ITenant> {
		const tenantId = RequestContext.currentTenantId();
		if (id !== tenantId) {
			throw new ForbiddenException();
		}
		await this.tenantService.update(id, entity);
		return await this.findById(id);
	}

	@ApiOperation({
		summary: 'Delete tenant',
		security: [
			{
				role: [RolesEnum.SUPER_ADMIN]
			}
		]
	})
	@ApiResponse({
		status: HttpStatus.NO_CONTENT,
		description: 'The tenant has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Tenant not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@UseGuards(RoleGuard, TenantPermissionGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@Delete(':id')
	async delete(
		@Param('id', UUIDValidationPipe) id: string
	) {
		const tenantId = RequestContext.currentTenantId();
		if (id !== tenantId) {
			throw new ForbiddenException();
		}
		return await this.tenantService.delete(id);
	}
	
}
