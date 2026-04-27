import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatConversationModule } from '../chat-conversation'
import { EnvironmentModule } from '../environment'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { AcpArtifact } from './acp-artifact.entity'
import { AcpArtifactService } from './acp-artifact.service'
import { AcpAuditService } from './acp-audit.service'
import { AcpChatEventProjectorService } from './acp-chat-event-projector.service'
import { AcpEventProjectorService } from './acp-event-projector.service'
import { AcpExecutionMapper } from './acp-execution.mapper'
import { AcpObserverTriggerService } from './acp-observer-trigger.service'
import { AcpObservationService } from './acp-observation.service'
import { AcpRuntimeController } from './acp-runtime.controller'
import { AcpRuntimeService } from './acp-runtime.service'
import { AcpSessionBridgeService } from './acp-session-bridge.service'
import { AcpSystemEventProjectorService } from './acp-system-event-projector.service'
import { AcpSession } from './acp-session.entity'
import { AcpSessionEvent } from './acp-session-event.entity'
import { AcpSessionEventService } from './acp-session-event.service'
import { AcpSessionService } from './acp-session.service'
import { AcpTarget } from './acp-target.entity'
import { AcpTargetService } from './acp-target.service'
import { AcpBackendRegistry } from './backends/acp-backend.registry'
import { AcpTargetRegistry } from './backends/acp-target.registry'
import { RemoteXpertAcpBackend } from './backends/remote-xpert-acp.backend'
import { DelegateCodingTaskMiddleware } from './delegate-coding-task.middleware'
import { AcpTaskHandoffProcessor } from '../handoff/plugins/acp/acp-task.processor'
import { CodexpertContextMcpMiddleware } from '../codexpert'

@Module({
  imports: [
    RouterModule.register([{ path: '/acp-runtime', module: AcpRuntimeModule }]),
    TypeOrmModule.forFeature([AcpSession, AcpSessionEvent, AcpArtifact, AcpTarget]),
    TenantModule,
    CqrsModule,
    EnvironmentModule,
    XpertAgentExecutionModule,
    ChatConversationModule
  ],
  controllers: [AcpRuntimeController],
  providers: [
    AcpSessionService,
    AcpSessionEventService,
    AcpTargetService,
    AcpArtifactService,
    AcpAuditService,
    AcpChatEventProjectorService,
    AcpExecutionMapper,
    AcpEventProjectorService,
    AcpObserverTriggerService,
    AcpObservationService,
    AcpSystemEventProjectorService,
    AcpSessionBridgeService,
    AcpTargetRegistry,
    RemoteXpertAcpBackend,
    AcpBackendRegistry,
    DelegateCodingTaskMiddleware,
    CodexpertContextMcpMiddleware,
    AcpTaskHandoffProcessor,
    AcpRuntimeService
  ],
  exports: [AcpRuntimeService, AcpSessionBridgeService, AcpAuditService, AcpArtifactService]
})
export class AcpRuntimeModule {}
