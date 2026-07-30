import { InjectQueue } from '@nestjs/bull'
import { Injectable } from '@nestjs/common'
import type { Queue } from 'bull'

export const MEMBERSHIP_MAINTENANCE_QUEUE = 'membership-maintenance'
export const TENANT_DEFAULT_MEMBERSHIP_BACKFILL_JOB = 'tenant-default-membership-backfill'
export const TENANT_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE = 100
export const ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB = 'organization-default-membership-backfill'
export const ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE = 100

export type TenantDefaultMembershipBackfillJob = {
    tenantId: string
    afterUserId: string | null
}

export type OrganizationDefaultMembershipBackfillJob = {
    tenantId: string
    organizationId: string
    afterUserOrganizationId: string | null
}

type MembershipBackfillJob = TenantDefaultMembershipBackfillJob | OrganizationDefaultMembershipBackfillJob

@Injectable()
export class MembershipBackfillQueueService {
    constructor(
        @InjectQueue(MEMBERSHIP_MAINTENANCE_QUEUE)
        private readonly queue: Queue<MembershipBackfillJob>
    ) {}

    async enqueueTenantDefaultMembershipBackfill(tenantId: string, afterUserId: string | null = null) {
        await this.queue.add(
            TENANT_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
            {
                tenantId,
                afterUserId
            },
            {
                attempts: 5,
                backoff: 10_000,
                removeOnComplete: true
            }
        )
    }

    async enqueueOrganizationDefaultMembershipBackfill(
        tenantId: string,
        organizationId: string,
        afterUserOrganizationId: string | null = null
    ) {
        await this.queue.add(
            ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
            {
                tenantId,
                organizationId,
                afterUserOrganizationId
            },
            {
                attempts: 5,
                backoff: 10_000,
                removeOnComplete: true
            }
        )
    }
}
