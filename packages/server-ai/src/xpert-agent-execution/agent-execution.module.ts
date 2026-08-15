import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { XpertAgentExecutionController } from './agent-execution.controller'
import { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime.module'
import { SuperAdminOrganizationScopeModule } from '../shared/super-admin-organization-scope.module'
import { ModelUsageModule } from '../model-usage'

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert-agent-execution', module: XpertAgentExecutionModule }]),
        TypeOrmModule.forFeature([XpertAgentExecution]),
        TenantModule,
        CqrsModule,
        SuperAdminOrganizationScopeModule,
        AgentMiddlewareRuntimeModule,
        ModelUsageModule
    ],
    controllers: [XpertAgentExecutionController],
    providers: [XpertAgentExecutionService, ...CommandHandlers, ...QueryHandlers],
    exports: [XpertAgentExecutionService]
})
export class XpertAgentExecutionModule {}
