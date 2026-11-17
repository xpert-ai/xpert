import { OutputStore } from '../user-notification/output/output-store'
import { FollowUpTimerSource } from './follow-up-timer.source'
import { FollowUpTimer } from './follow-up-timer.entity'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AGENT_EVENT_ENTITIES } from './agent-event.entity'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { PrivateDecisionRouter } from '../user-notification/output/private-decision-router'
import { OutputPreferences } from '../user-notification/output/output-preferences'
import { ChatChannelRegistry } from '@xpert-ai/plugin-sdk'
import { ManagedQueueModule, IntegrationModule } from '@xpert-ai/server-core'
import { HandoffQueueModule } from '../handoff/message-queue.module'
import { AgentInvocationModule } from '../agent-invocation/agent-invocation.module'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { AssistantSharingModule } from '../xpert/sharing/sharing.module'
import { XpertProjectAccessModule } from '../xpert-project/project-access.module'
import { AgentEventBindingService } from './agent-event-binding.service'
import { AgentEventController } from './agent-event.controller'
import { AgentEventRuntime, AgentEventSources } from './agent-event.runtime'
import { AgentEventWakeService } from './agent-event-wake.service'
import { AgentEventStore } from './agent-event.store'

import { WorkbenchDecisionService } from './workbench-decision.service'
import { EventBindingAccessService } from './event-binding-access.service'
import { EventInboxService } from './views/event-inbox.service'
import { EventInboxViewProvider } from './views/event-inbox.provider'
import { UserInboxHostDefinition } from './views/user-inbox-host.definition'

@Module({
    imports: [
        TypeOrmModule.forFeature([...AGENT_EVENT_ENTITIES, FollowUpTimer]),
        DiscoveryModule,
        IntegrationModule,
        CqrsModule,
        ManagedQueueModule,
        HandoffQueueModule,
        AgentInvocationModule,
        XpertWorkspaceModule,
        AssistantSharingModule,
        XpertProjectAccessModule
    ],
    exports: [OutputPreferences, FollowUpTimerSource, AgentEventSources, EventBindingAccessService],
    controllers: [AgentEventController],
    providers: [
        OutputStore,
        ChatChannelRegistry,
        OutputPreferences,
        PrivateDecisionRouter,
        WorkbenchDecisionService,
        UserInboxHostDefinition,
        EventBindingAccessService,
        EventInboxService,
        EventInboxViewProvider,
        AgentEventBindingService,
        AgentEventWakeService,
        FollowUpTimerSource,
        AgentEventStore,
        AgentEventSources,
        AgentEventRuntime
    ]
})
export class AgentEventModule {}
