import { RolesEnum } from '@metad/contracts'
import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Roles } from './../shared/decorators'
import { RoleGuard, TenantPermissionGuard } from './../shared/guards'
import { FeatureUpgradeCommand } from './commands'
import { FeatureService } from './feature.service'

@ApiTags('Feature')
@Controller()
export class FeatureController {
	constructor(
		private readonly featureService: FeatureService,
		private readonly commandBus: CommandBus
	) {}

	@ApiOperation({ summary: 'Enabled or disabled features' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created/updated.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@UseGuards(TenantPermissionGuard, RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@Post('upgrade')
	async upgradeFeatures(@Body() input: any) {
		return await this.commandBus.execute(new FeatureUpgradeCommand(input))
	}
}
