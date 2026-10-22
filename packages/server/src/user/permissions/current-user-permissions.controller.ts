import { Controller, Get, Header } from '@nestjs/common'
import type { IRolePermission } from '@xpert-ai/contracts'
import { AuthStrategies } from '../../shared/decorators/auth-strategies.decorator'
import { CurrentUserPermissionsService } from './current-user-permissions.service'

@Controller('me/permissions')
export class CurrentUserPermissionsController {
	constructor(private readonly permissions: CurrentUserPermissionsService) {}

	@Get()
	@AuthStrategies('jwt')
	@Header('Cache-Control', 'no-store')
	get(): Promise<IRolePermission['permission'][]> {
		return this.permissions.get()
	}
}
