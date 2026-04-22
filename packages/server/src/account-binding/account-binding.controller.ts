import {
	BadRequestException,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	UnauthorizedException
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { RequestContext } from '../core/context'
import { AccountBindingService } from './account-binding.service'

interface AccountBindingMeResponse {
	provider: string
	bound: boolean
	subjectId?: string
	profile?: Record<string, any>
	updatedAt?: Date
}

@ApiTags('AccountBinding')
@ApiBearerAuth()
@Controller()
export class AccountBindingController {
	constructor(private readonly accountBindingService: AccountBindingService) {}

	@Get('/me/:provider')
	async getCurrentUserBinding(
		@Param('provider') provider: string
	): Promise<AccountBindingMeResponse> {
		const { tenantId, userId } = this.getCurrentUserScope()
		const binding = await this.accountBindingService.getUserBinding({
			tenantId,
			userId,
			provider
		})

		if (!binding) {
			return {
				provider,
				bound: false
			}
		}

		return {
			provider,
			bound: true,
			subjectId: binding.subjectId,
			profile: binding.profile ?? undefined,
			updatedAt: binding.updatedAt
		}
	}

	@Delete('/me/:provider')
	@HttpCode(HttpStatus.NO_CONTENT)
	async unbindCurrentUser(@Param('provider') provider: string): Promise<void> {
		const { tenantId, userId } = this.getCurrentUserScope()
		await this.accountBindingService.unbindUser({
			tenantId,
			userId,
			provider
		})
	}

	private getCurrentUserScope() {
		const tenantId = RequestContext.getScope().tenantId
		const userId = RequestContext.currentUserId()

		if (!userId) {
			throw new UnauthorizedException('Unauthorized')
		}

		if (!tenantId) {
			throw new BadRequestException('Tenant scope is required.')
		}

		return {
			tenantId,
			userId
		}
	}
}
