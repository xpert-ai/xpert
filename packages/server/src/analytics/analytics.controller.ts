import { Body, Controller, Get, Post } from '@nestjs/common'
import { RequestContext, analyticsQueryRequestSchema, analyticsDiscoveryRequestSchema } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ZodValidationPipe } from '../shared/pipes/zod-validation.pipe'
import { AnalyticsRuntimeService } from './analytics-runtime.service'
import { analyticsError } from './analytics-errors'

/** Source authorization lives in the runtime; database permissions must not gate native source kinds. */
@Controller('analytics')
export class AnalyticsController {
	constructor(private readonly runtime: AnalyticsRuntimeService) {}
	@Get('sources')
	list() {
		return this.runtime.list(currentAnalyticsActor())
	}
	@Post('discover')
	discover(
		@Body(new ZodValidationPipe(analyticsDiscoveryRequestSchema, () => analyticsError('ANALYTICS_INVALID_REQUEST')))
		input: z.output<typeof analyticsDiscoveryRequestSchema>
	) {
		return this.runtime.discover(currentAnalyticsActor(), input)
	}
	@Post('query')
	query(
		@Body(new ZodValidationPipe(analyticsQueryRequestSchema, () => analyticsError('ANALYTICS_INVALID_REQUEST')))
		input: z.output<typeof analyticsQueryRequestSchema>
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
