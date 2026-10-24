import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RequestContext, type DataSourceActor } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

export function authorizeAnalyticsActor(actor: DataSourceActor) {
	if (
		!actor.tenantId ||
		!actor.organizationId ||
		!actor.userId ||
		actor.tenantId !== RequestContext.currentTenantId() ||
		actor.organizationId !== RequestContext.getOrganizationId() ||
		actor.userId !== RequestContext.currentUserId()
	) {
		throw new ForbiddenException({
			code: 'ANALYTICS_ACCESS_DENIED',
			message: t('server-ai:Error.AnalyticsAccessDenied', { defaultValue: 'Analytics access denied' })
		})
	}
}
export class AnalyticsRuntimeError extends BadRequestException {}
export function analyticsError(code: string) {
	return new AnalyticsRuntimeError({
		code,
		message:
			code === 'ANALYTICS_GRAIN_MISMATCH'
				? t('server-ai:Error.AnalyticsGrainMismatch', {
						defaultValue:
							'Returned rows repeat the declared grain. Inspect the actual rows and use a truly unique grain, or an empty grain for an unaggregated table. Do not discard source rows.'
					})
				: t('server-ai:Error.AnalyticsQueryInvalid', {
						defaultValue: 'Analytics query is unavailable or invalid'
					})
	})
}
export const SAFE_ANALYTICS_ERRORS = new Set([
	'ANALYTICS_FIELD_TYPE_MISMATCH',
	'ANALYTICS_FIELD_MISSING_OR_AMBIGUOUS',
	'ANALYTICS_GRAIN_MISMATCH',
	'ANALYTICS_PARAMETER_REQUIRED',
	'ANALYTICS_PARAMETER_INVALID',
	'ANALYTICS_UNKNOWN_CONTROL'
])
