import { SharedModule, TenantModule } from '@xpert-ai/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertModule } from '../xpert/xpert.module'
import { Xpert } from '../xpert/xpert.entity'
import { AssistantBindingUserPreference } from './assistant-binding-user-preference.entity'
import { AssistantBindingController } from './assistant-binding.controller'
import { AssistantBinding } from './assistant-binding.entity'
import { AssistantBindingService } from './assistant-binding.service'
import { BosiBootstrapController } from './bosi/bosi-bootstrap.controller'
import { BosiBootstrapService } from './bosi/bosi-bootstrap.service'
import { CqrsModule } from '@nestjs/cqrs'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { ConnectorModule } from '../connector/connector.module'
import { BosiOnboardingService } from './bosi/bosi-onboarding.service'
import { BosiConversationInitializer } from './bosi/bosi-conversation.initializer'

@Module({
    imports: [
        RouterModule.register([{ path: '/assistant-binding', module: AssistantBindingModule }]),
        TypeOrmModule.forFeature([AssistantBinding, AssistantBindingUserPreference, Xpert]),
        forwardRef(() => TenantModule),
        forwardRef(() => XpertModule),
        SharedModule,
        CqrsModule,
        ConnectorModule,
        forwardRef(() => XpertTemplateModule),
        forwardRef(() => XpertWorkspaceModule)
    ],
    controllers: [BosiBootstrapController, AssistantBindingController],
    providers: [AssistantBindingService, BosiBootstrapService, BosiOnboardingService, BosiConversationInitializer],
    exports: [AssistantBindingService]
})
export class AssistantBindingModule {}
