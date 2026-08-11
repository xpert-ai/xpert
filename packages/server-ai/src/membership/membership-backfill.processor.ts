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
import { MembershipService } from './membership.service'

type DefaultMembershipBackfillService = {
    canInitializeOrganizationDefaultMembership(input: {
        tenantId: string
        organizationId?: string | null
        actorUserId?: string | null
    }): Promise<boolean>
    backfillTenantDefaultMembershipBatch(input: {
        tenantId: string
        afterUserId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }>
    backfillOrganizationDefaultMembershipBatch(input: {
        tenantId: string
        organizationId: string
        actorUserId: string
        afterUserOrganizationId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }>
    backfillTenantOrganizationDefaultMembershipBatch(input: {
        tenantId: string
        actorUserId: string
        afterOrganizationId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        enqueued: number
        nextCursor: string | null
    }>
}

@Processor(MEMBERSHIP_MAINTENANCE_QUEUE)
export class MembershipBackfillProcessor {
    constructor(
        private readonly queueService: MembershipBackfillQueueService,
        @Inject(MembershipService)
        private readonly membershipService: DefaultMembershipBackfillService
    ) {}

    @OnEvent(EVENT_FEATURE_ORGANIZATION_UPDATED)
    async enqueueBackfillWhenFeatureEnabled(event: FeatureOrganizationUpdatedEvent) {
        if (
            event.featureCode !== AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN ||
            event.previousIsEnabled ||
            !event.isEnabled
        ) {
            return
        }

        const canInitializeOrganizations = await this.membershipService.canInitializeOrganizationDefaultMembership({
            tenantId: event.tenantId,
            organizationId: event.organizationId,
            actorUserId: event.actorUserId
        })
        if (event.organizationId) {
            if (event.actorUserId && canInitializeOrganizations) {
                await this.queueService.enqueueOrganizationDefaultMembershipBackfill(
                    event.tenantId,
                    event.organizationId,
                    event.actorUserId
                )
            }
        } else {
            await this.queueService.enqueueTenantDefaultMembershipBackfill(event.tenantId)
            if (event.actorUserId && canInitializeOrganizations) {
                await this.queueService.enqueueTenantOrganizationDefaultMembershipBackfill(
                    event.tenantId,
                    event.actorUserId
                )
            }
        }
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

    @Process({
        name: TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
        concurrency: 2
    })
    async processTenantOrganizationDefaultMembershipBackfill(job: Job<TenantOrganizationDefaultMembershipBackfillJob>) {
        const result = await this.membershipService.backfillTenantOrganizationDefaultMembershipBatch({
            tenantId: job.data.tenantId,
            actorUserId: job.data.actorUserId,
            afterOrganizationId: job.data.afterOrganizationId,
            take: TENANT_ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE
        })
        if (result.nextCursor) {
            await this.queueService.enqueueTenantOrganizationDefaultMembershipBackfill(
                job.data.tenantId,
                job.data.actorUserId,
                result.nextCursor
            )
        }
        return result
    }

    @Process({
        name: ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_JOB,
        concurrency: 2
    })
    async processOrganizationDefaultMembershipBackfill(job: Job<OrganizationDefaultMembershipBackfillJob>) {
        const result = await this.membershipService.backfillOrganizationDefaultMembershipBatch({
            tenantId: job.data.tenantId,
            organizationId: job.data.organizationId,
            actorUserId: job.data.actorUserId,
            afterUserOrganizationId: job.data.afterUserOrganizationId,
            take: ORGANIZATION_DEFAULT_MEMBERSHIP_BACKFILL_BATCH_SIZE
        })
        if (result.nextCursor) {
            await this.queueService.enqueueOrganizationDefaultMembershipBackfill(
                job.data.tenantId,
                job.data.organizationId,
                job.data.actorUserId,
                result.nextCursor
            )
        }
        return result
    }
}
