import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ChatConversationModule } from '../conversation.module'
import { XpertModule } from '../../xpert/xpert.module'
import { XpertProjectAccessModule } from '../../xpert-project/project-access.module'
import { XpertProjectModule } from '../../xpert-project/project.module'
import { ConversationMapViewProvider } from './provider'
import { ConversationMapService } from './service'

@Module({
    imports: [CqrsModule, ChatConversationModule, XpertModule, XpertProjectModule, XpertProjectAccessModule],
    providers: [ConversationMapService, ConversationMapViewProvider]
})
export class ConversationMapModule {}
