import { AiFeatureEnum } from '@xpert-ai/contracts'
import { EVENT_FEATURE_ORGANIZATION_UPDATED } from '@xpert-ai/server-core'
import type { FeatureOrganizationUpdatedEvent } from '@xpert-ai/server-core'
import { Process, Processor } from '@nestjs/bull'
import { Inject } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import type { Job } from 'bull'
import {
    MembershipBackfillQueueService,
    MEMBERSHIP_MAINTENANCE_QUEUE,
    TENANT_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE,
    TENANT_DEFAULT_MEMBERSHIP_BACKFILL_JOB
} from './membership-backfill.queue'
import type { TenantDefaultMembershipBackfillJob } from './membership-backfill.queue'
import { MembershipService } from './membership.service'

type TenantDefaultMembershipBackfillService = {
    backfillTenantDefaultMembershipBatch(input: {
        tenantId: string
        afterUserId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }>
}

@Processor(MEMBERSHIP_MAINTENANCE_QUEUE)
export class MembershipBackfillProcessor {
    constructor(
        private readonly queueService: MembershipBackfillQueueService,
        @Inject(MembershipService)
        private readonly membershipService: TenantDefaultMembershipBackfillService
    ) {}

    @OnEvent(EVENT_FEATURE_ORGANIZATION_UPDATED)
    async enqueueBackfillWhenFeatureEnabled(event: FeatureOrganizationUpdatedEvent) {
        if (
            event.organizationId ||
            event.featureCode !== AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN ||
            event.previousIsEnabled ||
            !event.isEnabled
        ) {
            return
        }

        await this.queueService.enqueueTenantDefaultMembershipBackfill(event.tenantId)
    }

    @Process({
        name: TENANT_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
        concurrency: 2
    })
    async processTenantDefaultMembershipBackfill(job: Job<TenantDefaultMembershipBackfillJob>) {
        const result = await this.membershipService.backfillTenantDefaultMembershipBatch({
            tenantId: job.data.tenantId,
            afterUserId: job.data.afterUserId,
            take: TENANT_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE
        })
        if (result.nextCursor) {
            await this.queueService.enqueueTenantDefaultMembershipBackfill(job.data.tenantId, result.nextCursor)
        }
        return result
    }
}
