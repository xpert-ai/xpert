import { Controller } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CrudController } from '../core/crud'
import { ApiKey } from './api-key.entity'
import { ApiKeyService } from './api-key.service'

@ApiTags('ApiKey')
@Controller()
export class ApiKeyController extends CrudController<ApiKey> {
	constructor(private readonly service: ApiKeyService) {
		super(service)
	}
}
