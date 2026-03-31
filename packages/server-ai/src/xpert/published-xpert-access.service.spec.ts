jest.mock('@metad/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        currentUserId: jest.fn(),
        getOrganizationId: jest.fn(),
        currentApiPrincipal: jest.fn()
    }
}))

jest.mock('./xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RequestContext } from '@metad/server-core'
import { PublishedXpertAccessService } from './published-xpert-access.service'

function createQueryBuilderMock(count: number) {
    return {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(count)
    }
}

describe('PublishedXpertAccessService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            requestedOrganizationId: 'org-requested'
        })
    })

    it('uses requestedOrganizationId when authorizing assistant access', async () => {
        const qb = createQueryBuilderMock(1)
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: null,
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn().mockReturnValue(qb)
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-1')).resolves.toMatchObject({
            id: 'xpert-1'
        })
        expect(qb.innerJoin).toHaveBeenCalledWith(
            'xpert.userGroups',
            'userGroup',
            'userGroup.tenantId = :tenantId AND userGroup.organizationId = :organizationId',
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-requested'
            })
        )
    })

    it('allows the creator to access a tenant-level published xpert without a user-group grant', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: null,
                createdById: 'user-1',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn()
        }
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(null)

        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-1')).resolves.toMatchObject({
            id: 'xpert-1'
        })
        expect(repository.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('rejects access when the published xpert cannot be found', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue(null),
            createQueryBuilder: jest.fn()
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('missing-xpert')).rejects.toThrow(NotFoundException)
    })

    it('rejects access when no bound user group grants membership', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: null,
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock(0))
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-1')).rejects.toThrow(ForbiddenException)
    })
})
