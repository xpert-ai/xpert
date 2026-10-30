import { NotFoundException } from '@nestjs/common'
import {
    AiModelTypeEnum,
    ModelAccessEventTypeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum,
    UserModelGrantStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelAccessEvent } from './model-access-event.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { createFixture, queryBuilder } from './model-access-service.test-fixture'
import { UserModelGrant } from './user-model-grant.entity'

describe('ModelAccessService approval idempotency', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('returns the existing grant without revalidating an expired approval input', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'admin-1',
            tenantId: 'tenant-1'
        })
        const { dataSource, service } = createFixture()
        const request = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: null,
            status: ModelAccessRequestStatusEnum.Approved
        }
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            requestId: 'request-1',
            status: UserModelGrantStatusEnum.Active
        }
        const requestQueryBuilder = queryBuilder(request)
        const eventRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        const grantRepository = {
            findOne: jest.fn().mockResolvedValue(grant)
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return {
                        createQueryBuilder: jest.fn(() => requestQueryBuilder)
                    }
                }
                if (entity === UserModelGrant) {
                    return grantRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.approveRequest('request-1', {
                validUntil: '2020-01-01T00:00:00.000Z'
            })
        ).resolves.toMatchObject({
            id: 'grant-1',
            events: []
        })
        expect(grantRepository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                requestId: 'request-1'
            }
        })
        expect(requestQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write')
    })
})

describe('ModelAccessService admin scope isolation', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('rejects requests outside the current tenant and organization scope', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'admin-1',
            tenantId: 'tenant-1'
        })
        const { dataSource, service } = createFixture()
        const requestQueryBuilder = queryBuilder<ModelAccessRequest>(null)
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return {
                        createQueryBuilder: jest.fn(() => requestQueryBuilder)
                    }
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(service.approveRequest('request-outside-scope', {})).rejects.toBeInstanceOf(NotFoundException)
        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.tenantId = :tenantId', {
            tenantId: 'tenant-1'
        })
        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.organizationId = :scopeOrganizationId', {
            scopeOrganizationId: 'org-1'
        })
    })
})

describe('ModelAccessService request scope resolution', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it.each([
        {
            description: 'keeps a tenant model in tenant approval when requested from an organization page',
            copilotOrganizationId: null,
            expectedScope: ModelAccessOwnershipScopeEnum.Tenant,
            expectedOrganizationId: null
        },
        {
            description: 'routes an organization model to that organization approval scope',
            copilotOrganizationId: 'org-1',
            expectedScope: ModelAccessOwnershipScopeEnum.Organization,
            expectedOrganizationId: 'org-1'
        }
    ])('$description', async ({ copilotOrganizationId, expectedScope, expectedOrganizationId }) => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { copilotRepository, dataSource, eventRepository, membershipService, service } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: copilotOrganizationId,
            name: 'Primary',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        membershipService.findModelAccess.mockResolvedValue(null)

        const requestRepository = {
            create: jest.fn((request) => request),
            save: jest.fn(async (request) => ({ ...request, id: 'request-1' })),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: 'org-1'
            })
        }
        const transactionEventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            find: eventRepository.find
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return transactionEventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed for authoring'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: expectedOrganizationId,
            requestedFromOrganizationId: 'org-1',
            ownershipScope: expectedScope
        })
        expect(requestRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: expectedOrganizationId,
                requestedFromOrganizationId: 'org-1',
                ownershipScope: expectedScope
            })
        )
    })

    it('rejects tenant model applications when tenant membership is disabled', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const { dataSource, membershipService, service } = createFixture()
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !!organizationId)

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed from the organization'
            })
        ).rejects.toThrow('Personal model access is disabled.')
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })
})

describe('ModelAccessService request concurrency', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('creates a request without membership balance and returns the same pending request on retry', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { dataSource, grantQueryBuilder, membershipService, requestQueryBuilder, service } = createFixture()
        membershipService.findModelAccess.mockResolvedValue(null)
        membershipService.hasConsumableBalance.mockResolvedValue(false)
        grantQueryBuilder.getOne.mockResolvedValue(null)
        requestQueryBuilder.getOne.mockResolvedValue(null)

        const savedRequest = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: null,
            requesterId: 'creator-user',
            requestedFromOrganizationId: null,
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            reason: 'Needed for authoring',
            status: ModelAccessRequestStatusEnum.Requested,
            modelSnapshot: {}
        }
        const requestRepository = {
            create: jest.fn(() => ({ ...savedRequest, id: undefined })),
            save: jest.fn().mockResolvedValue(savedRequest),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null
            })
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            find: jest.fn().mockResolvedValue([])
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed for authoring'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            status: ModelAccessRequestStatusEnum.Requested
        })

        requestQueryBuilder.getOne.mockResolvedValue(savedRequest)

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Retry should be idempotent'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            status: ModelAccessRequestStatusEnum.Requested
        })

        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
        expect(membershipService.hasConsumableBalance).not.toHaveBeenCalled()
        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.status = :status', {
            status: ModelAccessRequestStatusEnum.Requested
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.status = :status', {
            status: UserModelGrantStatusEnum.Active
        })
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: ModelAccessEventTypeEnum.Requested,
                fromStatus: null,
                toStatus: ModelAccessRequestStatusEnum.Requested
            })
        )
    })

    it('rejects a new request while an active grant exists', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { dataSource, grantQueryBuilder, membershipService, service } = createFixture()
        membershipService.findModelAccess.mockResolvedValue(null)
        grantQueryBuilder.getOne.mockResolvedValue({
            id: 'grant-1',
            status: UserModelGrantStatusEnum.Active
        })

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Duplicate access'
            })
        ).rejects.toThrow('This model is already granted.')
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('returns the request created by a concurrent transaction after the unique constraint wins', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const { dataSource, eventRepository, grantQueryBuilder, membershipService, requestQueryBuilder, service } =
            createFixture()
        const concurrentRequest = {
            id: 'request-concurrent',
            tenantId: 'tenant-1',
            organizationId: null,
            requesterId: 'creator-user',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            modelType: AiModelTypeEnum.LLM,
            status: ModelAccessRequestStatusEnum.Requested
        }
        requestQueryBuilder.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrentRequest)
        grantQueryBuilder.getOne.mockResolvedValue(null)
        membershipService.findModelAccess.mockResolvedValue(null)
        dataSource.transaction.mockRejectedValue({ code: '23505' })

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed for authoring'
            })
        ).resolves.toEqual({
            ...concurrentRequest,
            events: []
        })

        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
        expect(eventRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                requestId: 'request-concurrent'
            },
            order: {
                createdAt: 'ASC'
            }
        })
    })
})

describe('ModelAccessService request lifecycle', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('allows a fresh request after the requester withdraws the previous one', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { dataSource, grantQueryBuilder, membershipService, requestQueryBuilder, service } = createFixture()
        const previousRequest = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: null,
            requesterId: 'creator-user',
            requestedFromOrganizationId: null,
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            reason: 'Original reason',
            status: ModelAccessRequestStatusEnum.Requested,
            modelSnapshot: {}
        }
        const transactionRequestQueryBuilder = queryBuilder(previousRequest)
        const requestRepository = {
            createQueryBuilder: jest.fn(() => transactionRequestQueryBuilder),
            create: jest.fn((request) => request),
            save: jest.fn(async (request) =>
                'id' in request && request.id ? request : { ...request, id: 'request-2' }
            ),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null
            })
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            find: jest.fn().mockResolvedValue([])
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))
        membershipService.findModelAccess.mockResolvedValue(null)
        grantQueryBuilder.getOne.mockResolvedValue(null)
        requestQueryBuilder.getOne.mockResolvedValue(null)

        await expect(
            service.withdrawRequest('request-1', {
                reason: 'No longer needed'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            status: ModelAccessRequestStatusEnum.Withdrawn,
            decisionReason: 'No longer needed'
        })

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed again'
            })
        ).resolves.toMatchObject({
            id: 'request-2',
            status: ModelAccessRequestStatusEnum.Requested,
            reason: 'Needed again'
        })

        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: 'request-1',
                eventType: ModelAccessEventTypeEnum.Withdrawn,
                fromStatus: ModelAccessRequestStatusEnum.Requested,
                toStatus: ModelAccessRequestStatusEnum.Withdrawn,
                reason: 'No longer needed'
            })
        )
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: 'request-2',
                eventType: ModelAccessEventTypeEnum.Requested,
                fromStatus: null,
                toStatus: ModelAccessRequestStatusEnum.Requested,
                reason: 'Needed again'
            })
        )
    })
})
