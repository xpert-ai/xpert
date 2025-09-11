import { IIntegration } from '@metad/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { DifyService } from './dify.service'

@Controller()
export class DifyController {
	constructor(
		private service: DifyService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
