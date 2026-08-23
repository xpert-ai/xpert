import {
	IPluginRuntimeConvergenceStatus,
	IRuntimeRestartCapability,
	IRuntimeRestartResponse,
	IRuntimeRestartStatus,
	RolesEnum
} from '@xpert-ai/contracts'
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common'
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

	@ApiOperation({ summary: 'Read a coordinated API runtime restart operation' })
	@Get('restart/:restartId')
	async restartStatus(@Param('restartId') restartId: string): Promise<IRuntimeRestartStatus> {
		return await this.runtimeControl.restartStatus(restartId)
	}

	@ApiOperation({ summary: 'Read a plugin runtime convergence generation' })
	@Get('plugin-convergence/:generation')
	async pluginConvergenceStatus(
		@Param('generation', ParseIntPipe) generation: number
	): Promise<IPluginRuntimeConvergenceStatus> {
		return await this.runtimeControl.pluginConvergenceStatus(generation)
	}

	@ApiOperation({ summary: 'Gracefully restart all active API runtime replicas one at a time' })
	@ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Restart request accepted' })
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN)
	@HttpCode(HttpStatus.ACCEPTED)
	@Post('restart')
	async restart(@Body() input: RuntimeRestartRequestDto, @Req() request: Request): Promise<IRuntimeRestartResponse> {
		return await this.runtimeControl.requestRestart(input, { sourceIp: request.ip })
	}
}
