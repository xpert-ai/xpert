import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { TenantModule, UserOrganization } from '@xpert-ai/server-core'
import { MembershipController } from './membership.controller'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { MembershipService } from './membership.service'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'
import { Copilot } from '../copilot/copilot.entity'

@Module({
    imports: [
        RouterModule.register([{ path: '/membership', module: MembershipModule }]),
        TypeOrmModule.forFeature([
            MembershipPlan,
            UserMembership,
            MembershipPointLedger,
            Xpert,
            UserOrganization,
            Copilot
        ]),
        TenantModule,
        CqrsModule
    ],
    controllers: [MembershipController],
    providers: [MembershipService],
    exports: [MembershipService]
})
export class MembershipModule {}
