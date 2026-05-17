import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantModule } from '@xpert-ai/server-core'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { Xpert } from '../xpert/xpert.entity'
import { XpertAgentModule } from '../xpert-agent/xpert-agent.module'
import { PromptWorkflowController } from './prompt-workflow.controller'
import { PromptWorkflow } from './prompt-workflow.entity'
import { PromptWorkflowService } from './prompt-workflow.service'
import { QueryHandlers } from './queries'

@Module({
    imports: [
        TypeOrmModule.forFeature([PromptWorkflow, Xpert]),
        TenantModule,
        CqrsModule,
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => XpertAgentModule)
    ],
    controllers: [PromptWorkflowController],
    providers: [PromptWorkflowService, ...QueryHandlers],
    exports: [PromptWorkflowService]
})
export class PromptWorkflowModule {}
