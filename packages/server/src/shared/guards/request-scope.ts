import { t } from 'i18next'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { IRequestScopeContext, IUser, RequestScopeLevel } from '@xpert-ai/contracts'

export type ScopeRequest = { headers?: Record<string, unknown>; query?: unknown; body?: unknown }
const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const invalid = () =>
	new BadRequestException({
		code: 'request_scope_invalid',
		message: t('server-ai:Error.RequestScopeInvalid', { defaultValue: 'Invalid request scope.' })
	})
const denied = () =>
	new ForbiddenException({
		code: 'request_scope_mismatch',
		message: t('server-ai:Error.RequestScopeMismatch', {
			defaultValue: 'Request scope does not match the authenticated identity.'
		})
	})

function optionalId(value: unknown): string | null {
	if (value === undefined || value === null) return null
	if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw invalid()
	return value
}

function header(request: ScopeRequest, name: string): string | null {
	const matches = Object.entries(request.headers ?? {}).filter(([key]) => key.toLowerCase() === name)
	if (matches.length > 1) throw invalid()
	return optionalId(matches[0]?.[1])
}

/** Authenticate first. Legacy payload/query tenant IDs constrain identity; they never select another tenant. */
export function resolveAuthenticatedRequestScope(
	user: IUser | null | undefined,
	request: ScopeRequest
): IRequestScopeContext {
	if (!user?.id || !user.tenantId || user.isActive === false) throw denied()
	const tenantIds = [header(request, 'tenant-id')]
	const collectTenant = (value: unknown) => {
		if (!isObject(value)) return
		tenantIds.push(optionalId(value.tenantId))
		if (value.tenant !== undefined && value.tenant !== null) {
			if (!isObject(value.tenant)) throw invalid()
			tenantIds.push(optionalId(value.tenant.id))
		}
	}
	collectTenant(request.body)
	collectTenant(request.query)
	if (isObject(request.query) && request.query.data !== undefined) {
		let data: unknown = request.query.data
		if (typeof data === 'string') {
			try {
				data = JSON.parse(data)
			} catch {
				throw invalid()
			}
		}
		if (!isObject(data)) throw invalid()
		collectTenant(data)
		collectTenant(data.findInput)
	}
	if (tenantIds.some((id) => id !== null && id !== user.tenantId)) throw denied()
	const organizationId = header(request, 'organization-id')
	const requestedLevel = header(request, 'x-scope-level')
	if (
		requestedLevel &&
		requestedLevel !== RequestScopeLevel.TENANT &&
		requestedLevel !== RequestScopeLevel.ORGANIZATION
	)
		throw invalid()
	const level =
		requestedLevel === RequestScopeLevel.ORGANIZATION || (!requestedLevel && organizationId)
			? RequestScopeLevel.ORGANIZATION
			: RequestScopeLevel.TENANT
	if (
		(level === RequestScopeLevel.TENANT && organizationId) ||
		(level === RequestScopeLevel.ORGANIZATION && !organizationId)
	)
		throw invalid()
	return { tenantId: user.tenantId, organizationId, level }
}
