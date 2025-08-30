import { IIntegration } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { IntegrationService } from '@metad/server-core'
import { Body, Controller, Post } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { RAGFlowService } from './ragflow.service'

@Controller()
export class RAGFlowController {
	constructor(
		private integrationService: IntegrationService,
		private service: RAGFlowService,
		private configService: ConfigService,
		private eventEmitter: EventEmitter2
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
