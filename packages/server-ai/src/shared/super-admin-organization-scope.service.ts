import { IUser, LanguagesEnum, RolesEnum } from '@xpert-ai/contracts'
import { OrganizationService, RequestContext as LegacyRequestContext } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { IncomingHttpHeaders } from 'http'
import { captureRequestContext, runWithCapturedRequestContext } from './request-context'

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
        const scope = LegacyRequestContext.getScope()
        if (scope.level === 'organization' && scope.organizationId === organizationId) {
            return
        }

        if (user?.role?.name !== RolesEnum.SUPER_ADMIN) {
            throw new ForbiddenException('Only SUPER_ADMIN can override the organization scope for a request.')
        }

        if (!LegacyRequestContext.isTenantScope()) {
            throw new BadRequestException('Organization scope override is only supported for tenant-scope requests.')
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

        const context = captureRequestContext({
            user,
            tenantId: user.tenantId,
            organizationId,
            language,
            headers
        })
        return runWithCapturedRequestContext(context, callback)
    }
}

function readHeaderValue(headers: IncomingHttpHeaders | Headers | undefined, key: string): string | null {
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
