import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { McpPublication, McpPublicationAccess } from './entities'
import { McpPublicationAccessService } from './mcp-publication-access.service'

describe('McpPublicationAccessService', () => {
    let stored: McpPublicationAccess | null
    let publishAccessInvalidated: jest.Mock
    let service: McpPublicationAccessService

    beforeEach(() => {
        stored = null
        publishAccessInvalidated = jest.fn()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const repository = {
            findOne: jest.fn(async ({ where }: { where: Partial<McpPublicationAccess> }) =>
                stored &&
                stored.publicationId === where.publicationId &&
                stored.tenantId === where.tenantId &&
                stored.organizationId === where.organizationId &&
                (where.enabled === undefined || stored.enabled === where.enabled)
                    ? stored
                    : null
            ),
            create: jest.fn((input: Partial<McpPublicationAccess>) => Object.assign(new McpPublicationAccess(), input)),
            save: jest.fn(async (access: McpPublicationAccess) => {
                stored = access
                return access
            })
        } as unknown as Repository<McpPublicationAccess>
        service = new McpPublicationAccessService(repository, { publishAccessInvalidated } as never)
    })

    afterEach(() => jest.restoreAllMocks())

    it('persists independent organization admission and invalidates active sessions on changes', async () => {
        const publication = tenantPublication()

        await service.enable(publication, 'organization-a')
        await expect(service.assertEnabled(publication, 'organization-a')).resolves.toBeUndefined()
        expect(stored).toMatchObject({
            publicationId: publication.id,
            tenantId: 'tenant-1',
            organizationId: 'organization-a',
            enabled: true,
            enabledById: 'user-1'
        })

        await service.disable(publication, 'organization-a')
        await expect(service.assertEnabled(publication, 'organization-a')).rejects.toBeInstanceOf(ForbiddenException)
        expect(stored).toMatchObject({ enabled: false, disabledById: 'user-1' })
        expect(publishAccessInvalidated).toHaveBeenCalledTimes(2)
        expect(publishAccessInvalidated).toHaveBeenLastCalledWith(publication.id)
    })

    it('rejects cross-tenant management', async () => {
        await expect(
            service.enable(Object.assign(tenantPublication(), { tenantId: 'tenant-2' }), 'organization-a')
        ).rejects.toBeInstanceOf(ForbiddenException)
    })
})

function tenantPublication() {
    return Object.assign(new McpPublication(), {
        id: 'publication-1',
        tenantId: 'tenant-1',
        organizationId: null
    })
}
