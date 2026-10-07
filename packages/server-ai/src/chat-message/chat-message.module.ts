import { SharedModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { ResourceCardProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ChatMessageController } from './chat-message.controller'
import { ChatMessage } from './chat-message.entity'
import { ChatMessageService } from './chat-message.service'
import { CommandHandlers } from './commands/handlers'
import { FileAsset } from '../file-understanding/entities'

@Module({
    imports: [
        DiscoveryModule,
        RouterModule.register([{ path: '/chat-message', module: ChatMessageModule }]),
        TypeOrmModule.forFeature([ChatMessage, FileAsset]),
        SharedModule,
        CqrsModule
    ],
    controllers: [ChatMessageController],
    providers: [ChatMessageService, ResourceCardProviderRegistry, ...CommandHandlers],
    exports: [ChatMessageService]
})
export class ChatMessageModule {}
