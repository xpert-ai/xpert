import { IIntegration } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { Body, Controller, Post } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { FastGPTService } from './fastgpt.service'

@Controller()
export class FastGPTController {
	constructor(
		private service: FastGPTService,
		private configService: ConfigService,
		private eventEmitter: EventEmitter2
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
