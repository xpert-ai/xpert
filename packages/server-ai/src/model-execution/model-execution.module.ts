import { ModelExecutionReconciliationService } from './execution-reconciliation.service'
import { ShellCliExecution, ShellProcessExecution } from '../shell-execution/shell-execution.entity'
import { ShellExecutionSourceService } from '../shell-execution/shell-execution-source.service'
import { ModelExecutionReconciliation } from './execution-reconciliation.entity'
import { ModelExecutionChatService } from './execution-chat.service'
import { ModelExecutionQueryController } from './execution-query.controller'
import { ModelExecutionAdminController } from './execution-admin.controller'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../agent-invocation/invocation.entity'
import { ModelExecutionSourceService } from './execution-source.service'
import { ModelExecutionSessionController } from './execution-session.controller'
import { XpertModule } from '../xpert/xpert.module'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantSetting, User, UserOrganization } from '@xpert-ai/server-core'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { Copilot } from '../copilot/copilot.entity'
import { ModelAccessModule } from '../model-access/model-access.module'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'
import { ModelExecutionAdmissionService } from './execution-admission.service'
import { ModelExecutionGrantService } from './execution-grant.service'
import { ModelExecutionMeteringService } from './execution-metering.service'
import { ModelExecutionOpenAIController } from './execution-openai.controller'
import { ModelExecutionPolicyService } from './execution-policy'
import { CliSession, ModelExecutionGrant } from './execution.entity'
import { ModelExecutionNativeProviderService } from './execution-native-provider.service'
import { ModelExecutionNativeController } from './execution-native.controller'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'

@Module({
    imports: [
        CqrsModule,
        forwardRef(() => XpertModule),
        ModelAccessModule,
        AgentMiddlewareRuntimeModule,
        TypeOrmModule.forFeature([
            MembershipPointLedger,
            ShellCliExecution,
            ShellProcessExecution,
            AgentInvocationEntity,
            AgentRuntimeBindingEntity,
            ModelExecutionGrant,
            CliSession,
            ModelGatewayCall,
            ModelExecutionReconciliation,
            TenantSetting,
            User,
            UserOrganization,
            ChatConversation,
            Copilot,
            AssistantUserPreference,
            XpertAgentExecution
        ])
    ],
    controllers: [
        ModelExecutionNativeController,
        ModelExecutionQueryController,
        ModelExecutionOpenAIController,
        ModelExecutionSessionController,
        ModelExecutionAdminController
    ],
    providers: [
        ShellExecutionSourceService,
        ModelExecutionReconciliationService,
        ModelExecutionChatService,
        ModelExecutionNativeProviderService,
        ModelExecutionSourceService,
        AssistantExecutionPolicyService,
        ModelExecutionPolicyService,
        ModelExecutionGrantService,
        ModelExecutionAdmissionService,
        ModelExecutionMeteringService
    ],
    exports: [
        AssistantExecutionPolicyService,
        ModelExecutionPolicyService,
        ModelExecutionGrantService,
        ModelExecutionMeteringService
    ]
})
export class ModelExecutionModule {}
