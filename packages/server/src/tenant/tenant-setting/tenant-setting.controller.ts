import { ITenantSetting, RolesEnum } from '@xpert-ai/contracts'
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CommandBus } from '@nestjs/cqrs'
import { CrudController } from '../../core/crud'
import { Roles } from './../../shared/decorators/roles'
import { RoleGuard, TenantPermissionGuard } from './../../shared/guards'
import { TenantSetting } from './tenant-setting.entity'
import { TenantSettingService } from './tenant-setting.service'
import { TenantSettingGetCommand, TenantSettingSaveCommand } from './commands'
import { TenantSettingMutationGuard } from './tenant-setting-mutation.guard'

@ApiTags('TenantSetting')
@Controller()
@UseGuards(TenantPermissionGuard, RoleGuard, TenantSettingMutationGuard)
@Roles(RolesEnum.SUPER_ADMIN)
export class TenantSettingController extends CrudController<TenantSetting> {
	constructor(
		private readonly tenantSettingService: TenantSettingService,
		private readonly commandBus: CommandBus
	) {
		super(tenantSettingService)
	}

	@Get('retention-access')
	@UseGuards(TenantPermissionGuard, RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	canManageRetention(): boolean {
		return this.tenantSettingService.canManageRetention()
	}

	@ApiOperation({
		summary: 'Get tenant settings',
		security: [
			{
				role: [RolesEnum.ADMIN]
			}
		]
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Tenant not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@UseGuards(TenantPermissionGuard, RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@Get()
	async get() {
		return await this.commandBus.execute(new TenantSettingGetCommand())
	}

	@ApiOperation({
		summary: 'Tenant settings updated successfully'
	})
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'Tenant settings updated successfully.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@HttpCode(HttpStatus.CREATED)
	@UseGuards(TenantPermissionGuard, RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@Post()
	async saveSettings(@Body() entity: ITenantSetting): Promise<ITenantSetting> {
		return await this.commandBus.execute(new TenantSettingSaveCommand(entity))
	}
}
