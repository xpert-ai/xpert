import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EnvironmentModule } from '../environment'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { AcpArtifact } from './acp-artifact.entity'
import { AcpArtifactService } from './acp-artifact.service'
import { AcpAuditService } from './acp-audit.service'
import { AcpExecutionMapper } from './acp-execution.mapper'
import { AcpRuntimeController } from './acp-runtime.controller'
import { AcpRuntimeService } from './acp-runtime.service'
import { AcpSession } from './acp-session.entity'
import { AcpSessionEvent } from './acp-session-event.entity'
import { AcpSessionEventService } from './acp-session-event.service'
import { AcpSessionService } from './acp-session.service'
import { CommandHandlers } from './commands/handlers'
import { AcpHarnessRegistry } from './harness/acp-harness.registry'
import { ClaudeCodeCliHarnessAdapter } from './harness/claude-code-cli.adapter'
import { CodexCliHarnessAdapter } from './harness/codex-cli.adapter'
import { QueryHandlers } from './queries/handlers'
import { DelegateCodingTaskMiddleware } from './delegate-coding-task.middleware'
import { AcpTaskHandoffProcessor } from '../handoff/plugins/acp/acp-task.processor'

@Module({
  imports: [
    RouterModule.register([{ path: '/acp-runtime', module: AcpRuntimeModule }]),
    TypeOrmModule.forFeature([AcpSession, AcpSessionEvent, AcpArtifact]),
    TenantModule,
    CqrsModule,
    EnvironmentModule,
    XpertAgentExecutionModule
  ],
  controllers: [AcpRuntimeController],
  providers: [
    AcpSessionService,
    AcpSessionEventService,
    AcpArtifactService,
    AcpAuditService,
    AcpExecutionMapper,
    CodexCliHarnessAdapter,
    ClaudeCodeCliHarnessAdapter,
    AcpHarnessRegistry,
    DelegateCodingTaskMiddleware,
    AcpTaskHandoffProcessor,
    AcpRuntimeService,
    ...CommandHandlers,
    ...QueryHandlers
  ],
  exports: [AcpRuntimeService, AcpHarnessRegistry, AcpAuditService, AcpArtifactService]
})
export class AcpRuntimeModule {}
