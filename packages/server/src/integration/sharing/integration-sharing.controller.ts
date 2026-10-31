import { BadRequestException, Body, Controller, Get, Header, Param, Put, Query, UseGuards } from '@nestjs/common'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { z } from 'zod'
import { t } from 'i18next'
import { Permissions } from '../../shared/decorators/permissions'
import { PermissionGuard } from '../../shared/guards/permission.guard'
import { UUIDValidationPipe } from '../../shared/pipes'
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe'
import { IntegrationService } from '../integration.service'
import { integrationConsumptionQuerySchema, integrationSharingSchema } from './integration-sharing.schema'

@Controller()
export class IntegrationSharingController {
	constructor(private readonly integrations: IntegrationService) {}

	@Get('available')
	@Header('Cache-Control', 'no-store')
	available(
		@Query(
			new ZodValidationPipe(
				integrationConsumptionQuerySchema,
				() => new BadRequestException(t('server-ai:Error.IntegrationSharingInvalid'))
			)
		)
		query: z.output<typeof integrationConsumptionQuerySchema>
	) {
		return this.integrations.availableForUsage({ ...query, usage: query.usage ?? 'invoke' })
	}

	@Put(':id/sharing')
	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.INTEGRATION_EDIT)
	update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body(
			new ZodValidationPipe(
				integrationSharingSchema,
				() => new BadRequestException(t('server-ai:Error.IntegrationSharingInvalid'))
			)
		)
		sharing: Required<z.output<typeof integrationSharingSchema>>
	) {
		return this.integrations.updateSharing(id, sharing)
	}
}
