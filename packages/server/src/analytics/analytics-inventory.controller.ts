import { Controller, Get, Query } from '@nestjs/common'
import { analyticsInventoryPageSchema } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ZodValidationPipe } from '../shared/pipes/zod-validation.pipe'
import { analyticsError } from './analytics-errors'
import { currentAnalyticsActor } from './analytics.controller'
import { AnalyticsInventoryService } from './analytics-inventory.service'

@Controller('analytics/migration-inventory')
export class AnalyticsInventoryController {
	constructor(private readonly inventory: AnalyticsInventoryService) {}
	@Get('sources')
	list(
		@Query(new ZodValidationPipe(analyticsInventoryPageSchema, () => analyticsError('ANALYTICS_INVALID_REQUEST')))
		input: z.output<typeof analyticsInventoryPageSchema>
	) {
		return this.inventory.list(currentAnalyticsActor(), input.page)
	}
}
