import { AiFeatureEnum } from '@xpert-ai/contracts'
import type { FeatureOrganizationUpdatedEvent } from '@xpert-ai/server-core'
import type { Job, Queue } from 'bull'
import { MembershipBackfillProcessor } from './membership-backfill.processor'
import {
    MembershipBackfillQueueService,
    MEMBERSHIP_MAINTENANCE_QUEUE,
    ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
    ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
    TENANT_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
    TENANT_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
    TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
    TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB
} from './membership-backfill.queue'
import type {
    OrganizationDefaultMembershipBackfillJob,
    TenantDefaultMembershipBackfillJob,
    TenantOrganizationDefaultMembershipBackfillJob
} from './membership-backfill.queue'

describe('MembershipBackfillQueueService', () => {
    it('enqueues retryable tenant backfill jobs without a deduplication race', async () => {
        const queue = {
            add: jest.fn().mockResolvedValue(undefined)
        }
        const service = new MembershipBackfillQueueService(
            queue as unknown as Queue<TenantDefaultMembershipBackfillJob | OrganizationDefaultMembershipBackfillJob>
        )

        await service.enqueueTenantDefaultMembershipBackfill('tenant-1', 'user-100')

        expect(queue.add).toHaveBeenCalledWith(
            TENANT_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
            {
                tenantId: 'tenant-1',
                afterUserId: 'user-100'
            },
            {
                attempts: 5,
                backoff: 10_000,
                removeOnComplete: true
            }
        )
    })

    it('enqueues retryable organization backfill jobs without a deduplication race', async () => {
        const queue = {
            add: jest.fn().mockResolvedValue(undefined)
        }
        const service = new MembershipBackfillQueueService(
            queue as unknown as Queue<TenantDefaultMembershipBackfillJob | OrganizationDefaultMembershipBackfillJob>
        )

        await service.enqueueOrganizationDefaultMembershipBackfill(
            'tenant-1',
            'org-1',
            'admin-1',
            'user-organization-100'
        )

        expect(queue.add).toHaveBeenCalledWith(
            ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1',
                afterUserOrganizationId: 'user-organization-100'
            },
            {
                attempts: 5,
                backoff: 10_000,
                removeOnComplete: true
            }
        )
    })

    it('enqueues retryable tenant organization backfill jobs with the triggering actor', async () => {
        const queue = {
            add: jest.fn().mockResolvedValue(undefined)
        }
        const service = new MembershipBackfillQueueService(
            queue as unknown as Queue<
                | TenantDefaultMembershipBackfillJob
                | TenantOrganizationDefaultMembershipBackfillJob
                | OrganizationDefaultMembershipBackfillJob
            >
        )

        await service.enqueueTenantOrganizationDefaultMembershipBackfill('tenant-1', 'admin-1', 'org-100')

        expect(queue.add).toHaveBeenCalledWith(
            TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
            {
                tenantId: 'tenant-1',
                actorUserId: 'admin-1',
                afterOrganizationId: 'org-100'
            },
            {
                attempts: 5,
                backoff: 10_000,
                removeOnComplete: true
            }
        )
    })
})

describe('MembershipBackfillProcessor', () => {
    function createProcessor() {
        const queueService = {
            enqueueTenantDefaultMembershipBackfill: jest.fn().mockResolvedValue(undefined),
            enqueueTenantOrganizationDefaultMembershipBackfill: jest.fn().mockResolvedValue(undefined),
            enqueueOrganizationDefaultMembershipBackfill: jest.fn().mockResolvedValue(undefined)
        }
        const membershipService = {
            canInitializeOrganizationDefaultMembership: jest.fn().mockResolvedValue(true),
            backfillTenantDefaultMembershipBatch: jest.fn().mockResolvedValue({
                scanned: 2,
                assigned: 2,
                nextCursor: null
            }),
            backfillTenantOrganizationDefaultMembershipBatch: jest.fn().mockResolvedValue({
                scanned: 2,
                enqueued: 2,
                nextCursor: null
            }),
            backfillOrganizationDefaultMembershipBatch: jest.fn().mockResolvedValue({
                scanned: 2,
                assigned: 2,
                nextCursor: null
            })
        }
        const processor = new MembershipBackfillProcessor(
            queueService as unknown as MembershipBackfillQueueService,
            membershipService
        )

        return { membershipService, processor, queueService }
    }

    it('enqueues tenant backfill when the membership feature becomes enabled', async () => {
        const { processor, queueService } = createProcessor()

        await processor.enqueueBackfillWhenFeatureEnabled({
            tenantId: 'tenant-1',
            organizationId: null,
            featureId: 'feature-1',
            featureCode: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
            previousIsEnabled: false,
            isEnabled: true,
            actorUserId: 'admin-1'
        } as FeatureOrganizationUpdatedEvent)

        expect(queueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1')
        expect(queueService.enqueueTenantOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'admin-1'
        )
    })

    it('enqueues organization backfill when the membership feature becomes enabled', async () => {
        const { processor, queueService } = createProcessor()

        await processor.enqueueBackfillWhenFeatureEnabled({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            featureId: 'feature-1',
            featureCode: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
            previousIsEnabled: false,
            isEnabled: true,
            actorUserId: 'admin-1'
        } as FeatureOrganizationUpdatedEvent)

        expect(queueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
        expect(queueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('ignores non-membership feature transitions', async () => {
        const { processor, queueService } = createProcessor()

        await processor.enqueueBackfillWhenFeatureEnabled({
            tenantId: 'tenant-1',
            organizationId: null,
            featureId: 'feature-2',
            featureCode: AiFeatureEnum.FEATURE_MODEL_GATEWAY,
            previousIsEnabled: false,
            isEnabled: true
        } as FeatureOrganizationUpdatedEvent)

        expect(queueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()
        expect(queueService.enqueueOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('does not queue organization initialization when the triggering actor lacks edit permission', async () => {
        const { membershipService, processor, queueService } = createProcessor()
        membershipService.canInitializeOrganizationDefaultMembership.mockResolvedValue(false)

        await processor.enqueueBackfillWhenFeatureEnabled({
            tenantId: 'tenant-1',
            organizationId: null,
            actorUserId: 'builder-1',
            featureId: 'feature-1',
            featureCode: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
            previousIsEnabled: false,
            isEnabled: true
        } as FeatureOrganizationUpdatedEvent)

        expect(queueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1')
        expect(queueService.enqueueTenantOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
        expect(queueService.enqueueOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('does not enqueue a backfill when the membership feature becomes disabled', async () => {
        const { processor, queueService } = createProcessor()

        await processor.enqueueBackfillWhenFeatureEnabled({
            tenantId: 'tenant-1',
            organizationId: null,
            featureId: 'feature-1',
            featureCode: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
            previousIsEnabled: true,
            isEnabled: false
        } as FeatureOrganizationUpdatedEvent)

        expect(queueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()
        expect(queueService.enqueueOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('processes one bounded batch and enqueues the next cursor', async () => {
        const { membershipService, processor, queueService } = createProcessor()
        membershipService.backfillTenantDefaultMembershipBatch.mockResolvedValue({
            scanned: TENANT_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
            assigned: 90,
            nextCursor: 'user-100'
        })

        await processor.processTenantDefaultMembershipBackfill({
            data: {
                tenantId: 'tenant-1',
                afterUserId: null
            }
        } as Job<TenantDefaultMembershipBackfillJob>)

        expect(membershipService.backfillTenantDefaultMembershipBatch).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            afterUserId: null,
            take: TENANT_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE
        })
        expect(queueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1', 'user-100')
    })

    it('stops after the last batch', async () => {
        const { processor, queueService } = createProcessor()

        await processor.processTenantDefaultMembershipBackfill({
            data: {
                tenantId: 'tenant-1',
                afterUserId: 'user-100'
            }
        } as Job<TenantDefaultMembershipBackfillJob>)

        expect(queueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('processes inherited organizations in bounded batches', async () => {
        const { membershipService, processor, queueService } = createProcessor()
        membershipService.backfillTenantOrganizationDefaultMembershipBatch.mockResolvedValue({
            scanned: TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
            enqueued: TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
            nextCursor: 'org-100'
        })

        await processor.processTenantOrganizationDefaultMembershipBackfill({
            data: {
                tenantId: 'tenant-1',
                actorUserId: 'admin-1',
                afterOrganizationId: null
            }
        } as Job<TenantOrganizationDefaultMembershipBackfillJob>)

        expect(membershipService.backfillTenantOrganizationDefaultMembershipBatch).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            actorUserId: 'admin-1',
            afterOrganizationId: null,
            take: TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE
        })
        expect(queueService.enqueueTenantOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'admin-1',
            'org-100'
        )
    })

    it('processes one bounded organization batch and enqueues the next cursor', async () => {
        const { membershipService, processor, queueService } = createProcessor()
        membershipService.backfillOrganizationDefaultMembershipBatch.mockResolvedValue({
            scanned: ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
            assigned: 90,
            nextCursor: 'user-organization-100'
        })

        await processor.processOrganizationDefaultMembershipBackfill({
            data: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1',
                afterUserOrganizationId: null
            }
        } as Job<OrganizationDefaultMembershipBackfillJob>)

        expect(membershipService.backfillOrganizationDefaultMembershipBatch).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1',
            afterUserOrganizationId: null,
            take: ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE
        })
        expect(queueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1',
            'user-organization-100'
        )
    })

    it('uses the dedicated maintenance queue', () => {
        expect(MEMBERSHIP_MAINTENANCE_QUEUE).toBe('membership-maintenance')
    })
})
