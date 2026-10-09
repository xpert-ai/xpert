import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatConversationModule } from '../chat-conversation/conversation.module'
import { HandoffQueueModule } from '../handoff/message-queue.module'
import { SseStreamModule } from '../shared/stream'
import { XpertModule } from '../xpert/xpert.module'
import { AgentPluginModule } from '../agent-plugin/agent-plugin.module'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { XpertProjectModule } from '../xpert-project/project.module'
import { GroupAccessService } from './group-access.service'
import { GroupCatalogService } from './group-catalog.service'
import { GroupComposerService } from './group-composer.service'
import { GroupControlService } from './group-control.service'
import { GroupInteractionsService } from './group-interactions.service'
import { GroupMembersService } from './group-members.service'
import { GroupMessagesService } from './group-messages.service'
import { GroupMessageProcessor, GroupOutboxService } from './group-outbox.service'
import { GroupRuntimeViewService } from './group-runtime-view.service'
import { FinishGroupChatHandler, GroupRuntimeService, PrepareGroupChatHandler } from './group-runtime.service'
import { GroupStreamService } from './group-stream.service'
import { GroupToolsService } from './group-tools.service'
import { GROUP_ENTITIES } from './group.entities'
import { ResolveGroupDeliveryContextHandler } from './group-delivery-context.handler'
import { GetGroupConversationEntryHandler } from './group-conversation-entry.handler'

/** Owns group policy, delivery and runtime handlers; AIModule hosts only the authenticated HTTP adapters. */
@Module({
    imports: [
        CqrsModule,
        AgentPluginModule,
        XpertProjectModule,
        XpertWorkspaceModule,
        TypeOrmModule.forFeature(GROUP_ENTITIES),
        forwardRef(() => XpertModule),
        forwardRef(() => ChatConversationModule),
        HandoffQueueModule,
        SseStreamModule
    ],
    providers: [
        GroupAccessService,
        GetGroupConversationEntryHandler,
        GroupCatalogService,
        GroupComposerService,
        GroupControlService,
        GroupInteractionsService,
        GroupMembersService,
        GroupMessagesService,
        GroupOutboxService,
        GroupMessageProcessor,
        GroupRuntimeService,
        PrepareGroupChatHandler,
        ResolveGroupDeliveryContextHandler,
        FinishGroupChatHandler,
        GroupRuntimeViewService,
        GroupStreamService,
        GroupToolsService
    ],
    exports: [
        GroupAccessService,
        GroupCatalogService,
        GroupComposerService,
        GroupControlService,
        GroupInteractionsService,
        GroupMembersService,
        GroupMessagesService,
        GroupOutboxService,
        GroupRuntimeViewService,
        GroupStreamService
    ]
})
export class ChatGroupModule {}
