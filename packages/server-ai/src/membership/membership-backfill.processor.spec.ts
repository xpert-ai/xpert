import { AiFeatureEnum } from '@xpert-ai/contracts'
import type { FeatureOrganizationUpdatedEvent } from '@xpert-ai/server-core'
import type { Job, Queue } from 'bull'
import { MembershipBackfillProcessor } from './membership-backfill.processor'
import {
    MembershipBackfillQueueService,
    MEMBERSHIP_MAINTENANCE_QUEUE,
    TENANT_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
    TENANT_DEFAULT_MEMBERSHIP_BACKFILL_JOB
} from './membership-backfill.queue'
import type { TenantDefaultMembershipBackfillJob } from './membership-backfill.queue'

describe('MembershipBackfillQueueService', () => {
    it('enqueues retryable tenant backfill jobs without a deduplication race', async () => {
        const queue = {
            add: jest.fn().mockResolvedValue(undefined)
        }
        const service = new MembershipBackfillQueueService(
            queue as unknown as Queue<TenantDefaultMembershipBackfillJob>
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
})

describe('MembershipBackfillProcessor', () => {
    function createProcessor() {
        const queueService = {
            enqueueTenantDefaultMembershipBackfill: jest.fn().mockResolvedValue(undefined)
        }
        const membershipService = {
            backfillTenantDefaultMembershipBatch: jest.fn().mockResolvedValue({
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
            isEnabled: true
        } as FeatureOrganizationUpdatedEvent)

        expect(queueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1')
    })

    it('ignores non-tenant membership feature transitions', async () => {
        const { processor, queueService } = createProcessor()

        await processor.enqueueBackfillWhenFeatureEnabled({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            featureId: 'feature-1',
            featureCode: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
            previousIsEnabled: false,
            isEnabled: true
        } as FeatureOrganizationUpdatedEvent)
        await processor.enqueueBackfillWhenFeatureEnabled({
            tenantId: 'tenant-1',
            organizationId: null,
            featureId: 'feature-2',
            featureCode: AiFeatureEnum.FEATURE_MODEL_GATEWAY,
            previousIsEnabled: false,
            isEnabled: true
        } as FeatureOrganizationUpdatedEvent)

        expect(queueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()
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

    it('uses the dedicated maintenance queue', () => {
        expect(MEMBERSHIP_MAINTENANCE_QUEUE).toBe('membership-maintenance')
    })
})
