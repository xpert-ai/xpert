import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { TenantModule } from '@metad/server-core'
import { CopilotOrganization } from './copilot-organization.entity'
import { CopilotOrganizationService } from './copilot-organization.service'
import { CopilotOrganizationController } from './copilot-organization.controller'
import { QueryHandlers } from './queries/handlers'

@Module({
    imports: [
        RouterModule.register([{ path: '/copilot-organization', module: CopilotOrganizationModule }]),
        TypeOrmModule.forFeature([CopilotOrganization]),
        TenantModule,
        CqrsModule,
    ],
    controllers: [CopilotOrganizationController],
    providers: [CopilotOrganizationService, ...QueryHandlers],
    exports: [CopilotOrganizationService]
})
export class CopilotOrganizationModule { }
