import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext, analyticsQueryRequestSchema, analyticsDiscoveryRequestSchema } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { PermissionGuard, Permissions } from '../../shared'
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe'
import { AnalyticsRuntimeService } from './analytics-runtime.service'

@Controller('analytics')
@UseGuards(PermissionGuard)
@Permissions(PermissionsEnum.DATA_SOURCE_VIEW)
export class AnalyticsController {
	constructor(private readonly runtime: AnalyticsRuntimeService) {}
	@Get('sources')
	list() {
		return this.runtime.list(currentActor())
	}
	@Post('discover')
	discover(
		@Body(
			new ZodValidationPipe(
				analyticsDiscoveryRequestSchema,
				() =>
					new BadRequestException({
						code: 'ANALYTICS_INVALID_REQUEST',
						message: t('server-ai:Error.AnalyticsQueryInvalid', {
							defaultValue: 'Analytics query is unavailable or invalid'
						})
					})
			)
		)
		input: z.output<typeof analyticsDiscoveryRequestSchema>
	) {
		return this.runtime.discover(currentActor(), input)
	}
	@Post('query')
	query(
		@Body(
			new ZodValidationPipe(
				analyticsQueryRequestSchema,
				() =>
					new BadRequestException({
						code: 'ANALYTICS_INVALID_REQUEST',
						message: t('server-ai:Error.AnalyticsQueryInvalid', {
							defaultValue: 'Analytics query is unavailable or invalid'
						})
					})
			)
		)
		input: z.output<typeof analyticsQueryRequestSchema>
	) {
		return this.runtime.query(currentActor(), input)
	}
}
function currentActor() {
	return {
		tenantId: RequestContext.currentTenantId(),
		organizationId: RequestContext.getOrganizationId(),
		userId: RequestContext.currentUserId()
	}
}
