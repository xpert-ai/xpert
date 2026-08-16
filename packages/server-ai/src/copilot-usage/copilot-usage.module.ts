import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantModule, User } from '@xpert-ai/server-core'
import { CopilotOrganization } from '../copilot-organization/copilot-organization.entity'
import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { MembershipModule } from '../membership/membership.module'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import { CopilotUsageController } from './copilot-usage.controller'
import { CopilotUsageService } from './copilot-usage.service'
import { ModelUsageLedgerService } from './model-usage/model-usage-ledger.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/copilot-usage', module: CopilotUsageModule }]),
        CqrsModule,
        TypeOrmModule.forFeature([CopilotUser, CopilotOrganization, MembershipPointLedger, User]),
        MembershipModule,
        TenantModule
    ],
    controllers: [CopilotUsageController],
    providers: [CopilotUsageService, ModelUsageLedgerService],
    exports: [CopilotUsageService]
})
export class CopilotUsageModule {}
