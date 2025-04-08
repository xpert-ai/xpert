import { Controller, Param, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Environment } from './environment.entity'
import { EnvironmentService } from './environment.service'
import { CrudController } from '@metad/server-core'

@ApiTags('Environment')
@Controller()
export class EnvironmentController extends CrudController<Environment> {
	constructor(readonly service: EnvironmentService) {
		super(service)
	}

	@Put(':id/as-default')
	async setAsDefault(@Param('id') id: string) {
		return this.service.setAsDefault(id)
	}
}
