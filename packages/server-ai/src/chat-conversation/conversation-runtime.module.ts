import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { MessageWidgetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ConversationRuntimeService } from './conversation-runtime'

@Module({
    imports: [DiscoveryModule, CqrsModule],
    providers: [ConversationRuntimeService, MessageWidgetProviderRegistry],
    exports: [ConversationRuntimeService, MessageWidgetProviderRegistry]
})
export class ConversationRuntimeModule {}
