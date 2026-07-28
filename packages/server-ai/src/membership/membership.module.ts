import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { BullModule } from '@nestjs/bull'
import {
    FeatureOrganization,
    Organization,
    TenantModule,
    TenantSetting,
    User,
    UserOrganization
} from '@xpert-ai/server-core'
import { MembershipController } from './membership.controller'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { MembershipPeriod } from './membership-period.entity'
import { MembershipService } from './membership.service'
import { MembershipPeriodSchedulerService } from './membership-period-scheduler.service'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'
import { Copilot } from '../copilot/copilot.entity'
import { MembershipBackfillProcessor } from './membership-backfill.processor'
import { MembershipBackfillQueueService, MEMBERSHIP_MAINTENANCE_QUEUE } from './membership-backfill.queue'

@Module({
    imports: [
        RouterModule.register([{ path: '/membership', module: MembershipModule }]),
        BullModule.registerQueue({
            name: MEMBERSHIP_MAINTENANCE_QUEUE
        }),
        TypeOrmModule.forFeature([
            MembershipPlan,
            UserMembership,
            MembershipPointLedger,
            MembershipPeriod,
            Xpert,
            User,
            UserOrganization,
            Copilot,
            FeatureOrganization,
            TenantSetting,
            Organization
        ]),
        TenantModule,
        CqrsModule
    ],
    controllers: [MembershipController],
    providers: [
        MembershipService,
        MembershipPeriodSchedulerService,
        MembershipBackfillQueueService,
        MembershipBackfillProcessor
    ],
    exports: [MembershipService]
})
export class MembershipModule {}
