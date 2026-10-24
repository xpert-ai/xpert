import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RequestContext, type DataSourceActor } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { analyticsErrorDetails } from './analytics-error-details'

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
/** Only host-owned diagnostics enter this boundary; provider messages remain redacted. */
export class AnalyticsRuntimeError extends BadRequestException {
	constructor(details: { code: string; message: string; retryable?: boolean; stage?: string }) {
		const diagnostic = { stage: 'dependency', retryable: false, ...details }
		super(diagnostic)
		// ToolNode consumes Error.message, whereas HTTP consumes getResponse(). Keep both informative.
		this.message = JSON.stringify(diagnostic)
	}
}
export function analyticsError(code: string) {
	return new AnalyticsRuntimeError(analyticsErrorDetails(code))
}
export const SAFE_ANALYTICS_ERRORS = new Set([
	'ANALYTICS_FIELD_TYPE_MISMATCH',
	'ANALYTICS_FIELD_MISSING_OR_AMBIGUOUS',
	'ANALYTICS_GRAIN_MISMATCH',
	'ANALYTICS_PARAMETER_REQUIRED',
	'ANALYTICS_PARAMETER_INVALID',
	'ANALYTICS_UNKNOWN_CONTROL'
])
