import { IRuntimeRestartCapability, IRuntimeRestartResponse, RolesEnum } from '@xpert-ai/contracts'
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { Roles } from '../shared/decorators'
import { RoleGuard, TenantPermissionGuard } from '../shared/guards'
import { RuntimeRestartRequestDto } from './runtime-control.dto'
import { RuntimeControlService } from './runtime-control.service'

@ApiTags('System Runtime')
@Controller('system/runtime')
@UseGuards(TenantPermissionGuard)
export class RuntimeControlController {
	constructor(private readonly runtimeControl: RuntimeControlService) {}

	@ApiOperation({ summary: 'Read the current interactive session runtime restart capability' })
	@Get('restart-capability')
	restartCapability(): IRuntimeRestartCapability {
		return this.runtimeControl.restartCapability()
	}

	@ApiOperation({ summary: 'Gracefully restart the current API runtime instance' })
	@ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Restart request accepted' })
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@HttpCode(HttpStatus.ACCEPTED)
	@Post('restart')
	async restart(@Body() input: RuntimeRestartRequestDto, @Req() request: Request): Promise<IRuntimeRestartResponse> {
		return await this.runtimeControl.requestRestart(input, { sourceIp: request.ip })
	}
}
