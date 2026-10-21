import { Body, Controller, Get, Post } from '@nestjs/common'
import { RequestContext, analyticsQueryRequestV2Schema, analyticsDiscoveryRequestV2Schema } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ZodValidationPipe } from '../shared/pipes/zod-validation.pipe'
import { AnalyticsRuntimeV2Service } from './analytics-runtime-v2.service'
import { analyticsError } from './analytics-errors'

/** Source authorization lives in the runtime; database permissions must not gate native source kinds. */
@Controller('analytics')
export class AnalyticsV2Controller {
	constructor(private readonly runtime: AnalyticsRuntimeV2Service) {}
	@Get('sources')
	list() {
		return this.runtime.list(currentAnalyticsActor())
	}
	@Post('discover')
	discover(
		@Body(
			new ZodValidationPipe(analyticsDiscoveryRequestV2Schema, () => analyticsError('ANALYTICS_INVALID_REQUEST'))
		)
		input: z.output<typeof analyticsDiscoveryRequestV2Schema>
	) {
		return this.runtime.discover(currentAnalyticsActor(), input)
	}
	@Post('query')
	query(
		@Body(new ZodValidationPipe(analyticsQueryRequestV2Schema, () => analyticsError('ANALYTICS_INVALID_REQUEST')))
		input: z.output<typeof analyticsQueryRequestV2Schema>
	) {
		return this.runtime.query(currentAnalyticsActor(), input)
	}
}
export function currentAnalyticsActor() {
	return {
		tenantId: RequestContext.currentTenantId(),
		organizationId: RequestContext.getOrganizationId(),
		userId: RequestContext.currentUserId()
	}
}
