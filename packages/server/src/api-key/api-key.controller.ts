import { PermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from './../shared/decorators/permissions'
import { Controller } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CrudController } from '../core/crud'
import { ApiKey } from './api-key.entity'
import { ApiKeyService } from './api-key.service'

@ApiTags('ApiKey')
@Controller()
@Permissions(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
export class ApiKeyController extends CrudController<ApiKey> {
	constructor(private readonly service: ApiKeyService) {
		super(service)
	}
}
