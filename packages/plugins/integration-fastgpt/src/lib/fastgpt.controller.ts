import { IIntegration } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { Body, Controller, Post } from '@nestjs/common'
import { FastGPTService } from './fastgpt.service'

@Controller()
export class FastGPTController {
	constructor(
		private service: FastGPTService,
		private configService: ConfigService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
