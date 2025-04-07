import { Controller } from '@nestjs/common'
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
}
