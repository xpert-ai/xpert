import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../handoff/runtime-messaging/runtime-message.entity'
import { RuntimeMessageAccessService } from '../handoff/runtime-messaging/runtime-message-access.service'
import {
    RuntimeMessageInboxService,
    ClaimAgentRuntimeResultsHandler
} from '../handoff/runtime-messaging/runtime-message-inbox.service'
import { RuntimeMessageTransportService } from '../handoff/runtime-messaging/runtime-message-transport.service'
import { RuntimeMessageContinuationService } from '../handoff/runtime-messaging/runtime-message-continuation.service'
import { RuntimeMessageProcessor } from '../handoff/runtime-messaging/runtime-message.processor'
import { RuntimeObservationMonitorService } from '../handoff/runtime-messaging/runtime-observation-monitor.service'
import { RuntimeDeliveryController } from '../handoff/runtime-messaging/runtime-delivery.controller'
import { RequestRuntimeResultCheckHandler } from '../handoff/runtime-messaging/runtime-result-check.handler'
import { CancelTaskWaitsHandler, CheckTaskWaitClaimHandler } from './task-wait-control'
import { InvocationResultsProvider } from './invocation-results.provider'
import { ArtifactsModule } from '../artifacts/artifacts.module'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AgentInvocationWaitStore } from './invocation-wait.store'
import { InvocationContinuationDispatcher } from './invocation-continuation-dispatcher.service'
import { AgentInvocationMonitorService } from './invocation-monitor.service'
import { AgentInvocationsController } from './invocations.controller'
import { AssistantTaskRuntimeStrategy } from './assistant-task-adapter'
import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { AgentRuntimeRegistry } from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from './invocation-runtime'
import { AgentInvocationStore } from './invocation-store'
import {
    AgentInvocationEntity,
    AgentRuntimeBindingEntity,
    AgentInvocationEventEntity,
    AgentInvocationWaitEntity
} from './invocation.entity'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { AgentRuntimeBindingsController } from './runtime-bindings.controller'
import { NativeAgentRuntimeStrategy } from './native-agent.strategy'
import { TypeOrmAgentInvocationStore } from './typeorm-invocation.store'
import { NativeAgentInvocationReader } from './native-invocation-reader'

@Module({
    imports: [
        ArtifactsModule,
        DiscoveryModule,
        CqrsModule,
        TypeOrmModule.forFeature([
            AgentRuntimeDelivery,
            AgentRuntimeInbox,
            AgentInvocationEntity,
            AgentRuntimeBindingEntity,
            AgentInvocationEventEntity,
            AgentInvocationWaitEntity,
            User,
            UserOrganization,
            XpertAgentExecution
        ])
    ],
    controllers: [RuntimeDeliveryController, AgentRuntimeBindingsController, AgentInvocationsController],
    providers: [
        RequestRuntimeResultCheckHandler,
        RuntimeMessageAccessService,
        RuntimeMessageInboxService,
        ClaimAgentRuntimeResultsHandler,
        RuntimeMessageTransportService,
        RuntimeMessageContinuationService,
        RuntimeMessageProcessor,
        RuntimeObservationMonitorService,
        InvocationResultsProvider,
        AgentInvocationWaitStore,
        AgentInvocationMonitorService,
        InvocationContinuationDispatcher,
        CancelTaskWaitsHandler,
        CheckTaskWaitClaimHandler,
        AgentRuntimeRegistry,
        NativeAgentRuntimeStrategy,
        AssistantTaskRuntimeStrategy,
        AgentInvocationFactoryService,
        NativeAgentInvocationReader,
        { provide: AgentInvocationStore, useClass: TypeOrmAgentInvocationStore },
        {
            provide: AgentInvocationRuntime,
            inject: [AgentInvocationStore, AgentRuntimeRegistry],
            useFactory: (store: AgentInvocationStore, registry: AgentRuntimeRegistry) =>
                new AgentInvocationRuntime(store, registry)
        }
    ],
    exports: [RuntimeMessageAccessService, AgentInvocationRuntime, AgentRuntimeRegistry, AgentInvocationFactoryService]
})
export class AgentInvocationModule {}
