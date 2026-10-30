import {
    AiModelTypeEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessEventTypeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum,
    UserModelGrantStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FeatureOrganization } from '@xpert-ai/server-core'
import { ModelAccessEvent } from '../model-access-event.entity'
import { ModelAccessRequest } from '../model-access-request.entity'
import { createFixture, queryBuilder } from '../testing/model-access-service.test-fixture'
import { modelAccessEndOfDay } from '../model-access.service'
import { UserModelGrant } from '../user-model-grant.entity'

describe('ModelAccessService organization cleanup', () => {
    it('closes organization requests and revokes organization grants when a user leaves', async () => {
        const { dataSource, service } = createFixture()
        const request = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            requestedFromOrganizationId: 'org-1',
            requesterId: 'user-1',
            status: ModelAccessRequestStatusEnum.Requested,
            modelSnapshot: {}
        }
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            requestId: 'request-1',
            userId: 'user-1',
            status: UserModelGrantStatusEnum.Active,
            modelSnapshot: {}
        }
        const requestRepository = {
            find: jest.fn().mockResolvedValue([request]),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: 'org-1'
            }),
            save: jest.fn(async (entity) => entity)
        }
        const grantRepository = {
            find: jest.fn().mockResolvedValue([grant]),
            save: jest.fn(async (entity) => entity)
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            findOne: jest.fn()
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
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

        await service.closeOrganizationAccessForRemovedUser({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(requestRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                requesterId: 'user-1',
                status: ModelAccessRequestStatusEnum.Requested
            }
        })
        expect(request).toMatchObject({
            status: ModelAccessRequestStatusEnum.Closed,
            closedReasonCode: ModelAccessClosedReasonCodeEnum.UserLeftOrganization
        })
        expect(grant).toMatchObject({
            status: UserModelGrantStatusEnum.Revoked,
            revokeReason: ModelAccessClosedReasonCodeEnum.UserLeftOrganization
        })
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: ModelAccessEventTypeEnum.UserLeftOrganization,
                systemReasonCode: ModelAccessClosedReasonCodeEnum.UserLeftOrganization
            })
        )
    })
})

describe('ModelAccessService lifecycle batches', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('limits each lifecycle query and returns keyset cursors for the next batch', async () => {
        const { grantQueryBuilder, requestQueryBuilder, service, lifecycle } = createFixture()
        const requests = Array.from(
            { length: 200 },
            (_, index) => ({ id: `request-${index + 1}` }) as ModelAccessRequest
        )
        const grants = Array.from({ length: 200 }, (_, index) => ({ id: `grant-${index + 1}` }) as UserModelGrant)
        requestQueryBuilder.getMany.mockResolvedValue(requests)
        grantQueryBuilder.getMany.mockResolvedValue(grants)
        const reconciler = lifecycle
        jest.spyOn(reconciler, 'reconcilePendingRequest').mockResolvedValue(false)
        jest.spyOn(reconciler, 'reconcileGrantAvailability').mockResolvedValue(false)

        await expect(
            service.reconcileLifecycleBatch({
                requestAfterId: 'request-0',
                grantAfterId: 'grant-0',
                limit: 500
            })
        ).resolves.toEqual({
            requests: 0,
            grants: 0,
            nextRequestAfterId: 'request-200',
            nextGrantAfterId: 'grant-200'
        })

        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.id > :requestAfterId', {
            requestAfterId: 'request-0'
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.id > :grantAfterId', {
            grantAfterId: 'grant-0'
        })
        expect(requestQueryBuilder.orderBy).toHaveBeenCalledWith('request.id', 'ASC')
        expect(grantQueryBuilder.orderBy).toHaveBeenCalledWith('grant.id', 'ASC')
        expect(requestQueryBuilder.take).toHaveBeenCalledWith(200)
        expect(grantQueryBuilder.take).toHaveBeenCalledWith(200)
    })

    it('resets each cursor after the final partial batch', async () => {
        const { grantQueryBuilder, requestQueryBuilder, service, lifecycle } = createFixture()
        requestQueryBuilder.getMany.mockResolvedValue([{ id: 'request-last' } as ModelAccessRequest])
        grantQueryBuilder.getMany.mockResolvedValue([{ id: 'grant-last' } as UserModelGrant])
        const reconciler = lifecycle
        jest.spyOn(reconciler, 'reconcilePendingRequest').mockResolvedValue(true)
        jest.spyOn(reconciler, 'reconcileGrantAvailability').mockResolvedValue(true)

        await expect(service.reconcileLifecycleBatch({ limit: 200 })).resolves.toEqual({
            requests: 1,
            grants: 1,
            nextRequestAfterId: null,
            nextGrantAfterId: null
        })
    })
})

describe('ModelAccessService grant lifecycle', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('rejects shortening a grant and allows extending it to permanent with an audit event', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'admin-1',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)

        const { dataSource, service } = createFixture()
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            status: UserModelGrantStatusEnum.Active,
            validUntil: new Date('2027-05-01T00:00:00.000Z'),
            approvedAt: new Date('2026-07-27T00:00:00.000Z'),
            modelSnapshot: {}
        }
        const transactionGrantQueryBuilder = queryBuilder(grant)
        const grantRepository = {
            createQueryBuilder: jest.fn(() => transactionGrantQueryBuilder),
            save: jest.fn(async (entity) => entity)
        }
        const requestRepository = {
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
        const grantFeatureRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder({ isEnabled: true }))
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === UserModelGrant) {
                    return grantRepository
                }
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                if (entity === FeatureOrganization) {
                    return grantFeatureRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.extendGrant('grant-1', {
                validUntil: '2027-04-01T00:00:00.000Z'
            })
        ).rejects.toThrow('The new expiration must be later than the current expiration.')

        await expect(
            service.extendGrant('grant-1', {
                validUntil: null,
                note: 'Approved for permanent use'
            })
        ).resolves.toMatchObject({
            id: 'grant-1',
            status: UserModelGrantStatusEnum.Active,
            validUntil: null
        })

        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                grantId: 'grant-1',
                eventType: ModelAccessEventTypeEnum.Extended,
                fromStatus: UserModelGrantStatusEnum.Active,
                toStatus: UserModelGrantStatusEnum.Active,
                reason: 'Approved for permanent use',
                metadata: expect.objectContaining({
                    previousValidUntil: '2027-05-01T00:00:00.000Z',
                    validUntil: null
                })
            })
        )
    })

    it('expires due grants in a bounded batch and records the status transition', async () => {
        const { dataSource, service, lifecycle } = createFixture()
        jest.mocked(lifecycle.processDueGrants).mockRestore()
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            status: UserModelGrantStatusEnum.Active,
            validUntil: new Date('2026-07-26T23:59:59.999Z'),
            approvedAt: new Date('2026-07-01T00:00:00.000Z'),
            modelSnapshot: {}
        }
        const dueGrantQueryBuilder = queryBuilder(null, [grant])
        const grantRepository = {
            createQueryBuilder: jest.fn(() => dueGrantQueryBuilder),
            save: jest.fn(async (entity) => entity)
        }
        const requestRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null
            })
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event)
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === UserModelGrant) {
                    return grantRepository
                }
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

        await expect(service.processDueGrants({ tenantId: 'tenant-1' })).resolves.toBe(1)

        expect(dueGrantQueryBuilder.take).toHaveBeenCalledWith(500)
        expect(grantRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'grant-1',
                status: UserModelGrantStatusEnum.Expired
            })
        )
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                grantId: 'grant-1',
                eventType: ModelAccessEventTypeEnum.GrantExpired,
                fromStatus: UserModelGrantStatusEnum.Active,
                toStatus: UserModelGrantStatusEnum.Expired
            })
        )
    })
})

describe('model access expiration dates', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('uses the tenant timezone end of day in a fixed-offset zone', () => {
        expect(modelAccessEndOfDay('2027-03-14', 'Asia/Shanghai').toISOString()).toBe('2027-03-14T15:59:59.999Z')
    })

    it('uses the tenant timezone end of day across daylight-saving time', () => {
        expect(modelAccessEndOfDay('2027-03-14', 'America/New_York').toISOString()).toBe('2027-03-15T03:59:59.999Z')
    })

    it('includes the selected tenant-local day in the admin expiration filter', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { grantQueryBuilder, organizationRepository, service } = createFixture()

        await service.findAdminGrants({ expiresBefore: '2027-03-14' })

        expect(organizationRepository.findOne).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-1', isDefault: true },
            select: { id: true, timeZone: true }
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.validUntil <= :expiresBefore', {
            expiresBefore: new Date('2027-03-14T15:59:59.999Z')
        })
    })
})
