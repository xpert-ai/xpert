jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { ForbiddenException } from '@nestjs/common'
import {
    RolesEnum,
    UserGroupManagedByEnum,
    UserGroupManagedEntityTypeEnum,
    XpertAccessRequestStatusEnum,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { RequestContext, User, UserGroup } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import type { Xpert } from '../xpert/xpert.entity'
import { XpertAccessRequest } from './xpert-access-request.entity'
import { XpertMarketplaceService } from './xpert-marketplace.service'

function asRepository<T extends object>(repository: Partial<Repository<T>>) {
    return repository as unknown as Repository<T>
}

function createDiscoverableXpert(overrides: Partial<Xpert> = {}) {
    return {
        id: 'xpert-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdById: 'owner-1',
        slug: 'support-agent',
        name: 'Support Agent',
        type: XpertTypeEnum.Agent,
        latest: true,
        publishAt: new Date('2026-01-01T00:00:00.000Z'),
        userGroups: [],
        ...overrides
    } as Xpert
}

function createRequest(overrides: Partial<XpertAccessRequest> = {}) {
    return {
        id: 'request-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        xpertId: 'xpert-1',
        requesterId: 'user-1',
        status: XpertAccessRequestStatusEnum.REQUESTED,
        reason: 'Need it for support triage',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides
    } as XpertAccessRequest
}

function createDiscoverableQueryBuilder(xpert: Xpert | null = createDiscoverableXpert()) {
    return {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(xpert),
        getMany: jest.fn().mockResolvedValue(xpert ? [xpert] : [])
    }
}

function createService(options?: {
    xpert?: Xpert | null
    existingRequest?: XpertAccessRequest | null
    decisionRequest?: XpertAccessRequest | null
    managedGroup?: UserGroup | null
    requester?: User | null
}) {
    const queryBuilder = createDiscoverableQueryBuilder(options?.xpert)
    const requestQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([])
    }
    const xpertRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        save: jest.fn().mockImplementation(async (entity: Xpert) => entity)
    }
    const requestRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(requestQueryBuilder),
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValueOnce(options?.existingRequest ?? options?.decisionRequest ?? null),
        create: jest.fn().mockImplementation((input: Partial<XpertAccessRequest>) => input as XpertAccessRequest),
        save: jest.fn().mockImplementation(async (entity: XpertAccessRequest) => entity)
    }
    const createdGroup = {
        id: 'group-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        name: 'Xpert access - Support Agent',
        managedBy: UserGroupManagedByEnum.XPERT_MARKETPLACE,
        managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
        managedEntityId: 'xpert-1',
        members: []
    } as UserGroup
    const userGroupRepository = {
        findOne: jest.fn().mockResolvedValue(options?.managedGroup ?? null),
        create: jest.fn().mockReturnValue(createdGroup),
        save: jest.fn().mockImplementation(async (entity: UserGroup) => ({
            ...entity,
            id: entity.id ?? 'group-1'
        }))
    }
    const userRepository = {
        findOne: jest.fn().mockResolvedValue(
            options?.requester === undefined
                ? ({
                      id: 'user-1',
                      tenantId: 'tenant-1',
                      email: 'user@example.com'
                  } as User)
                : options.requester
        )
    }

    const service = new XpertMarketplaceService(
        asRepository<Xpert>(xpertRepository),
        asRepository<XpertAccessRequest>(requestRepository),
        asRepository<UserGroup>(userGroupRepository),
        asRepository<User>(userRepository)
    )

    return {
        service,
        queryBuilder,
        requestQueryBuilder,
        xpertRepository,
        requestRepository,
        userGroupRepository,
        userRepository,
        createdGroup
    }
}

describe('XpertMarketplaceService', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'user-1',
            tenantId: 'tenant-1',
            role: {
                name: RolesEnum.VIEWER,
                rolePermissions: []
            }
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('returns the existing requested access request instead of creating a duplicate', async () => {
        const existingRequest = createRequest()
        const { service, requestRepository } = createService({
            existingRequest
        })

        const result = await service.requestAccess('xpert-1', {
            reason: 'Please approve again'
        })

        expect(result).toMatchObject({
            id: 'request-1',
            xpertId: 'xpert-1',
            status: XpertAccessRequestStatusEnum.REQUESTED,
            reason: 'Need it for support triage'
        })
        expect(requestRepository.create).not.toHaveBeenCalled()
        expect(requestRepository.save).not.toHaveBeenCalled()
    })

    it('rejects approve decisions from users who cannot review the xpert', async () => {
        const decisionRequest = createRequest({
            xpert: createDiscoverableXpert({
                createdById: 'owner-1',
                workspace: {
                    id: 'workspace-1',
                    name: 'Workspace',
                    status: 'active',
                    ownerId: 'owner-1',
                    members: []
                }
            })
        })
        const { service, requestRepository } = createService({
            decisionRequest
        })

        await expect(service.approveRequest('request-1')).rejects.toThrow(ForbiddenException)
        expect(requestRepository.save).not.toHaveBeenCalled()
    })

    it('approves by creating the managed marketplace access user group and binding it to the xpert', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'owner-1',
            tenantId: 'tenant-1',
            role: {
                name: RolesEnum.VIEWER,
                rolePermissions: []
            }
        })

        const xpert = createDiscoverableXpert({
            createdById: 'owner-1',
            userGroups: []
        })
        const decisionRequest = createRequest({
            requesterId: 'user-1',
            xpert
        })
        const { service, xpertRepository, requestRepository, userGroupRepository } = createService({
            decisionRequest
        })

        const result = await service.approveRequest('request-1', {
            response: 'Approved'
        })

        expect(userGroupRepository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                managedBy: UserGroupManagedByEnum.XPERT_MARKETPLACE,
                managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
                managedEntityId: 'xpert-1'
            },
            relations: ['members']
        })
        expect(userGroupRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                managedBy: UserGroupManagedByEnum.XPERT_MARKETPLACE,
                managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
                managedEntityId: 'xpert-1',
                members: []
            })
        )
        expect(userGroupRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'group-1',
                members: [expect.objectContaining({ id: 'user-1' })]
            })
        )
        expect(xpertRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                userGroups: [expect.objectContaining({ id: 'group-1' })]
            })
        )
        expect(requestRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                status: XpertAccessRequestStatusEnum.APPROVED,
                reviewerId: 'owner-1',
                response: 'Approved',
                accessGroupId: 'group-1'
            })
        )
        expect(result).toMatchObject({
            status: XpertAccessRequestStatusEnum.APPROVED,
            reviewerId: 'owner-1',
            accessGroupId: 'group-1'
        })
    })

    it('approves by reusing the existing managed marketplace access user group', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'owner-1',
            tenantId: 'tenant-1',
            role: {
                name: RolesEnum.VIEWER,
                rolePermissions: []
            }
        })

        const existingGroup = {
            id: 'group-existing',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            managedBy: UserGroupManagedByEnum.XPERT_MARKETPLACE,
            managedEntityType: UserGroupManagedEntityTypeEnum.XPERT,
            managedEntityId: 'xpert-1',
            members: []
        } as UserGroup
        const xpert = createDiscoverableXpert({
            createdById: 'owner-1',
            userGroups: []
        })
        const decisionRequest = createRequest({
            requesterId: 'user-1',
            xpert
        })
        const { service, xpertRepository, requestRepository, userGroupRepository } = createService({
            decisionRequest,
            managedGroup: existingGroup
        })

        const result = await service.approveRequest('request-1')

        expect(userGroupRepository.create).not.toHaveBeenCalled()
        expect(userGroupRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'group-existing',
                members: [expect.objectContaining({ id: 'user-1' })]
            })
        )
        expect(xpertRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                userGroups: [expect.objectContaining({ id: 'group-existing' })]
            })
        )
        expect(requestRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                status: XpertAccessRequestStatusEnum.APPROVED,
                accessGroupId: 'group-existing'
            })
        )
        expect(result).toMatchObject({
            status: XpertAccessRequestStatusEnum.APPROVED,
            accessGroupId: 'group-existing'
        })
    })
})
