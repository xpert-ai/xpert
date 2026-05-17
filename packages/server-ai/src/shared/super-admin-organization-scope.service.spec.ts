import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { LanguagesEnum, RolesEnum } from '@xpert-ai/contracts'
import { OrganizationService, RequestContext, runWithRequestContext } from '@xpert-ai/server-core'
import { SuperAdminOrganizationScopeService } from './super-admin-organization-scope.service'

type RequestUser = {
    id: string
    tenantId: string
    preferredLanguage: LanguagesEnum
    role: {
        name: RolesEnum
    }
}

function createUser(role: RolesEnum): RequestUser {
    return {
        id: 'user-1',
        tenantId: 'tenant-1',
        preferredLanguage: LanguagesEnum.English,
        role: {
            name: role
        }
    }
}

function runInLegacyRequestContext<T>(
    headers: Record<string, string>,
    user: RequestUser,
    callback: () => Promise<T>
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        runWithRequestContext({ headers, user }, () => {
            callback().then(resolve).catch(reject)
        })
    })
}

describe('SuperAdminOrganizationScopeService', () => {
    let findOneByOptions: jest.Mock
    let service: SuperAdminOrganizationScopeService

    beforeEach(() => {
        const organizationService = Object.create(OrganizationService.prototype) as OrganizationService
        findOneByOptions = jest.fn().mockResolvedValue({ id: 'org-2' })
        organizationService.findOneByOptions = findOneByOptions
        service = new SuperAdminOrganizationScopeService(organizationService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('does not require SUPER_ADMIN when the requested organization matches the current organization scope', async () => {
        const result = await runInLegacyRequestContext(
            {
                'organization-id': 'org-1',
                'x-scope-level': 'organization'
            },
            createUser(RolesEnum.ADMIN),
            () => service.run('org-1', async () => 'ok')
        )

        expect(result).toBe('ok')
    })

    it('rejects regular users attempting to override to another organization', async () => {
        await expect(
            runInLegacyRequestContext(
                {
                    'organization-id': 'org-1',
                    'x-scope-level': 'organization'
                },
                createUser(RolesEnum.ADMIN),
                () => service.run('org-2', async () => 'ok')
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('runs SUPER_ADMIN tenant-scope requests inside the requested organization context', async () => {
        const result = await runInLegacyRequestContext(
            {
                'x-request-id': 'request-1',
                'x-scope-level': 'tenant'
            },
            createUser(RolesEnum.SUPER_ADMIN),
            () =>
                service.run('org-2', async () => ({
                    level: RequestContext.getScope().level,
                    organizationId: RequestContext.getOrganizationId()
                }))
        )

        expect(result).toEqual({
            level: 'organization',
            organizationId: 'org-2'
        })
        expect(findOneByOptions).toHaveBeenCalledWith({
            where: {
                id: 'org-2'
            }
        })
    })

    it('rejects SUPER_ADMIN organization-scope requests for a different organization', async () => {
        await expect(
            runInLegacyRequestContext(
                {
                    'organization-id': 'org-1',
                    'x-scope-level': 'organization'
                },
                createUser(RolesEnum.SUPER_ADMIN),
                () => service.run('org-2', async () => 'ok')
            )
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})
