import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ConversationEnvironmentFilesService } from './conversation-environment-files.service'
import { ResolveConversationEnvironmentFilesHandler } from './resolve-conversation-environment-files.handler'

@Module({
    imports: [CqrsModule],
    providers: [ConversationEnvironmentFilesService, ResolveConversationEnvironmentFilesHandler],
    exports: [ConversationEnvironmentFilesService]
})
export class ConversationEnvironmentFilesModule {}
