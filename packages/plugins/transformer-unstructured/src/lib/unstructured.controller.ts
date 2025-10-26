import { type IIntegration } from '@metad/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { UnstructuredService } from './unstructured.service'
import { Unstructured } from './types'

@Controller(Unstructured)
export class UnstructuredController {
	constructor(
		private service: UnstructuredService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
