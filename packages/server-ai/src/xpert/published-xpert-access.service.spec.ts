jest.mock('@xpert-ai/server-core', () => ({
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
import { RequestContext } from '@xpert-ai/server-core'
import { PublishedXpertAccessService } from './published-xpert-access.service'

function createQueryBuilderMock(options?: { count?: number; rows?: { id: string }[] }) {
    return {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(options?.rows ?? []),
        getCount: jest.fn().mockResolvedValue(options?.count ?? 0)
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
        const qb = createQueryBuilderMock({ count: 1 })
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-requested',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn().mockReturnValue(qb)
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-1')).resolves.toMatchObject({
            id: 'xpert-1'
        })
        expect(qb.leftJoin).toHaveBeenCalledWith(
            'xpert.userGroups',
            'userGroup',
            'userGroup.tenantId = :tenantId AND userGroup.organizationId = :organizationId',
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-requested'
            })
        )
        expect(qb.leftJoin).toHaveBeenCalledWith('xpert.workspace', 'workspace')
        expect(qb.leftJoin).toHaveBeenCalledWith(
            'workspace.members',
            'workspaceMember',
            'workspaceMember.id = :userId',
            expect.objectContaining({
                userId: 'user-1'
            })
        )
    })

    it('allows the creator to access an organization-level published xpert without a user-group grant', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-requested',
                createdById: 'user-1',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn()
        }

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

    it('allows workspace members to access a published xpert without a user-group grant', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-requested',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock({ count: 1 }))
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-1')).resolves.toMatchObject({
            id: 'xpert-1'
        })
    })

    it('allows a tenant-level published xpert without organization context', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(null)
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)

        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-tenant',
                tenantId: 'tenant-1',
                organizationId: null,
                createdById: 'user-admin',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn()
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-tenant')).resolves.toMatchObject({
            id: 'xpert-tenant'
        })
        expect(repository.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('allows a tenant-level published xpert when the current user is inside an organization', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-tenant-org-user',
                tenantId: 'tenant-1',
                organizationId: null,
                createdById: 'user-admin',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn()
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-tenant-org-user')).resolves.toMatchObject({
            id: 'xpert-tenant-org-user'
        })
        expect(repository.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('still requires organization context for an organization-level published xpert', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(null)
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)

        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-org',
                tenantId: 'tenant-1',
                organizationId: 'org-requested',
                createdById: 'user-admin',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn()
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-org')).rejects.toThrow(
            'Organization context is required to access published assistants.'
        )
    })

    it('includes creator-owned xperts in the accessible published xpert list', async () => {
        const qb = createQueryBuilderMock({
            rows: [{ id: 'xpert-1' }]
        })
        const repository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-requested',
                    createdById: 'user-1',
                    publishAt: new Date()
                }
            ]),
            createQueryBuilder: jest.fn().mockReturnValue(qb)
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(
            service.findAccessiblePublishedXperts({
                where: {
                    type: 'Agent' as any,
                    latest: true
                }
            })
        ).resolves.toEqual([
            expect.objectContaining({
                id: 'xpert-1'
            })
        ])
        expect(qb.getRawMany).toHaveBeenCalled()
    })

    it('includes ordered columns in the distinct select list for PostgreSQL compatibility', async () => {
        const qb = createQueryBuilderMock({
            rows: [{ id: 'xpert-1' }]
        })
        const repository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-requested',
                    createdById: 'user-1',
                    publishAt: new Date()
                }
            ]),
            createQueryBuilder: jest.fn().mockReturnValue(qb)
        }
        const service = new PublishedXpertAccessService(repository as any)

        await service.findAccessiblePublishedXperts({
            where: {
                type: 'Agent' as any,
                latest: true
            },
            order: {
                createdAt: 'DESC'
            }
        })

        expect(qb.addSelect).toHaveBeenCalledWith('xpert.createdAt', 'order_createdAt')
    })

    it('rejects access when none of creator, workspace membership, or user-group membership grants access', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-requested',
                publishAt: new Date()
            }),
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock({ count: 0 }))
        }
        const service = new PublishedXpertAccessService(repository as any)

        await expect(service.getAccessiblePublishedXpert('xpert-1')).rejects.toThrow(ForbiddenException)
    })
})
