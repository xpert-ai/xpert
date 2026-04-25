import { IUser, LanguagesEnum, RolesEnum } from '@xpert-ai/contracts'
import {
	OrganizationService,
	RequestContext as LegacyRequestContext,
	runWithRequestContext as runWithLegacyRequestContext
} from '@xpert-ai/server-core'
import { RequestContext, runWithRequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { IncomingHttpHeaders } from 'http'

@Injectable()
export class SuperAdminOrganizationScopeService {
	constructor(private readonly organizationService: OrganizationService) {}

	async run<T>(organizationId: string | null | undefined, callback: () => Promise<T>): Promise<T> {
		const normalizedOrganizationId = organizationId?.trim()
		if (!normalizedOrganizationId) {
			return callback()
		}

		const user = LegacyRequestContext.currentUser(true)
		this.assertCanOverrideScope(user, normalizedOrganizationId)
		const organization = await this.organizationService.findOneByOptions({
			where: {
				id: normalizedOrganizationId
			}
		})
		if (!organization) {
			throw new BadRequestException('The requested organization was not found in the current tenant.')
		}

		return this.runInOrganizationContext(user, normalizedOrganizationId, callback)
	}

	private assertCanOverrideScope(user: IUser, organizationId: string) {
		if (user?.role?.name !== RolesEnum.SUPER_ADMIN) {
			throw new ForbiddenException('Only SUPER_ADMIN can override the organization scope for a request.')
		}

		const scope = LegacyRequestContext.getScope()
		if (scope.level === 'organization' && scope.organizationId === organizationId) {
			return
		}

		if (!LegacyRequestContext.isTenantScope()) {
			throw new BadRequestException(
				'Organization scope override is only supported for tenant-scope requests.'
			)
		}
	}

	private async runInOrganizationContext<T>(user: IUser, organizationId: string, callback: () => Promise<T>) {
		const requestId = readHeaderValue(LegacyRequestContext.currentRequest()?.headers, 'x-request-id')
		const language = user.preferredLanguage ?? LanguagesEnum.English
		const headers: Record<string, string> = {
			language,
			['organization-id']: organizationId,
			['x-scope-level']: 'organization'
		}
		if (requestId) {
			headers['x-request-id'] = requestId
		}

		const request = {
			user,
			headers
		}

		return new Promise<T>((resolve, reject) => {
			runWithRequestContext(request, {}, () => {
				const scopedRequest = RequestContext.currentRequest() ?? request
				runWithLegacyRequestContext(scopedRequest, () => {
					callback().then(resolve).catch(reject)
				})
			})
		})
	}
}

function readHeaderValue(
	headers: IncomingHttpHeaders | Headers | undefined,
	key: string
): string | null {
	if (!headers) {
		return null
	}

	if (headers instanceof Headers) {
		const value = headers.get(key)
		return value?.trim() || null
	}

	const value = headers[key]
	if (Array.isArray(value)) {
		return value[0] ?? null
	}

	return typeof value === 'string' && value ? value : null
}
