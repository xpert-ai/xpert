import { Body, Controller, Delete, Get, Header, Param, Post, UseGuards } from '@nestjs/common'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from '../shared/decorators/permissions'
import { PermissionGuard } from '../shared/guards/permission.guard'
import { IntegrationQrService } from './integration-qr.service'

@Controller('qr')
@UseGuards(PermissionGuard)
@Permissions(PermissionsEnum.INTEGRATION_EDIT)
export class IntegrationQrController {
	constructor(private readonly qr: IntegrationQrService) {}

	@Post('providers/:provider')
	@Header('Cache-Control', 'no-store')
	begin(@Param('provider') provider: string, @Body() input: unknown) {
		return this.qr.begin(provider, input)
	}

	@Get('sessions/:id')
	@Header('Cache-Control', 'no-store')
	poll(@Param('id') id: string) {
		return this.qr.poll(id)
	}

	@Post('sessions/:id/complete')
	complete(@Param('id') id: string) {
		return this.qr.complete(id)
	}

	@Delete('sessions/:id')
	cancel(@Param('id') id: string) {
		return this.qr.cancel(id)
	}
}
