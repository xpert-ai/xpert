import { HandoffOutboxAdapters } from './outbox-adapters.service'
import { AgentChatDispatchHandoffProcessor } from './plugins/agent-chat/agent-chat-dispatch.processor'
import { BullModule } from '@nestjs/bull'
import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { RedisModule, TaskControlModule, ManagedQueueModule } from '@xpert-ai/server-core'
import { ConfigModule } from '@xpert-ai/server-config'
import { HANDOFF_QUEUE_SERVICE_TOKEN, HandoffProcessorRegistry } from '@xpert-ai/plugin-sdk'
import { XPERT_HANDOFF_QUEUES } from './constants'
import { HandoffQueueGatewayService } from './dispatcher/handoff-queue-gateway.service'
import { HandoffRouteResolver } from './dispatcher/handoff-route-resolver.service'
import { HandoffRoutingConfigService } from './dispatcher/handoff-routing-config.service'
import { HandoffDeadService } from './dead-letter.service'
import { registerHandoffPluginServicePermissionHandler } from './handoff-permission'
import { MessageDispatcherService } from './message-dispatcher.service'
import {
    HandoffQueueBatchProcessor,
    HandoffQueueIntegrationProcessor,
    HandoffQueueProcessor,
    HandoffQueueRealtimeProcessor
} from './message-queue.processor'
import { HandoffQueueService } from './message-queue.service'
import { HandoffPendingResultService } from './pending-result.service'
import { CommandHandlers } from './commands/handlers'
import { LocalQueueTaskService } from './local-sync-task.service'
import { Processors } from './plugins'
import { HandoffCancelService } from './handoff-cancel.service'
import { AgentChatRealtimeService } from './agent-chat-realtime.service'

@Global()
@Module({
    imports: [
        TaskControlModule,
        ManagedQueueModule,
        DiscoveryModule,
        CqrsModule,
        RedisModule,
        ConfigModule,
        BullModule.registerQueueAsync(
            ...XPERT_HANDOFF_QUEUES.map((name) => ({
                name,
                useFactory: () => {
                    // Independent deployments may share Redis without sharing executable chat work.
                    const prefix = process.env.HANDOFF_QUEUE_PREFIX?.trim()
                    return prefix ? { prefix } : {}
                }
            }))
        )
    ],
    providers: [
        HandoffOutboxAdapters,
        HandoffProcessorRegistry,
        MessageDispatcherService,
        HandoffDeadService,
        HandoffPendingResultService,
        HandoffRoutingConfigService,
        HandoffRouteResolver,
        HandoffQueueGatewayService,
        HandoffQueueService,
        HandoffCancelService,
        AgentChatRealtimeService,
        { provide: HANDOFF_QUEUE_SERVICE_TOKEN, useExisting: HandoffQueueService },
        HandoffQueueProcessor,
        HandoffQueueRealtimeProcessor,
        HandoffQueueBatchProcessor,
        HandoffQueueIntegrationProcessor,
        LocalQueueTaskService,
        ...Processors,
        ...CommandHandlers
    ],
    exports: [HandoffOutboxAdapters, HandoffQueueService, AgentChatRealtimeService, AgentChatDispatchHandoffProcessor]
})
export class HandoffQueueModule {
    constructor() {
        registerHandoffPluginServicePermissionHandler()
    }
}
