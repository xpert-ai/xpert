import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common'
import { PermissionsEnum, type TBusinessAreaGrantInput } from '@xpert-ai/contracts'
import { Permissions } from '../../shared/decorators/permissions'
import { UUIDValidationPipe } from '../../shared/pipes/uuid-validation.pipe'
import { BusinessAreaAccessService } from './business-area-access.service'
import {
	businessAreaAccessPipe,
	businessAreaAccessQuerySchema,
	businessAreaGrantSchema
} from './business-area-access.schema'

@Controller()
@Permissions(PermissionsEnum.BUSINESS_AREA_VIEW, PermissionsEnum.BUSINESS_AREA_MANAGE)
export class BusinessAreaAccessController {
	constructor(private readonly access: BusinessAreaAccessService) {}

	@Get('access/capabilities')
	capabilities() {
		return this.access.capabilities()
	}

	@Get('access/groups/:groupId')
	group(@Param('groupId', UUIDValidationPipe) id: string) {
		return this.access.forGroup(id)
	}

	@Get(':id/access')
	explain(
		@Param('id', UUIDValidationPipe) id: string,
		@Query(businessAreaAccessPipe(businessAreaAccessQuerySchema)) query: { userId?: string }
	) {
		return this.access.explain(id, query.userId)
	}

	@Get(':id/grants')
	list(@Param('id', UUIDValidationPipe) id: string) {
		return this.access.list(id)
	}

	@Get(':id/access/candidates')
	candidates(@Param('id', UUIDValidationPipe) id: string) {
		return this.access.candidates(id)
	}

	@Put(':id/grants')
	upsert(
		@Param('id', UUIDValidationPipe) id: string,
		@Body(businessAreaAccessPipe(businessAreaGrantSchema)) input: TBusinessAreaGrantInput
	) {
		return this.access.upsert(id, input)
	}

	@Delete(':id/grants/:grantId')
	async remove(@Param('id', UUIDValidationPipe) id: string, @Param('grantId', UUIDValidationPipe) grantId: string) {
		await this.access.remove(id, grantId)
		return { success: true }
	}
}
