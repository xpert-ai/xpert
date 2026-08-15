import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantModule } from '@xpert-ai/server-core'
import { CopilotOrganization } from '../copilot-organization/copilot-organization.entity'
import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import { CopilotUsageController } from './copilot-usage.controller'
import { CopilotUsageService } from './copilot-usage.service'
import { ModelUsageModule } from '../model-usage'

@Module({
    imports: [
        RouterModule.register([{ path: '/copilot-usage', module: CopilotUsageModule }]),
        CqrsModule,
        TypeOrmModule.forFeature([CopilotUser, CopilotOrganization, MembershipPointLedger]),
        TenantModule,
        ModelUsageModule
    ],
    controllers: [CopilotUsageController],
    providers: [CopilotUsageService],
    exports: [CopilotUsageService]
})
export class CopilotUsageModule {}
