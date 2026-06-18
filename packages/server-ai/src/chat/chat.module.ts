import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ChatController } from './chat.controller'
import { ChatEventsGateway } from './chat.gateway'
import { CommandHandlers } from './commands/handlers'
import { CopilotModule } from '../copilot'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { KnowledgebaseModule } from '../knowledgebase/'
import { ConversationTitleService } from '../shared'
import { XpertToolsetModule } from '../xpert-toolset/'
import { XpertProjectModule } from '../xpert-project/project.module'
import { SPEECH_TO_TEXT_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import {
    PluginSpeechToTextPermissionService,
    registerSpeechToTextPluginServicePermissionHandler
} from './speech-to-text-permission'
import { SpeechToTextService } from './speech-to-text.service'
import { XpertModule } from '../xpert'

@Module({
    imports: [
        CqrsModule,
        CopilotModule,
        CopilotCheckpointModule,
        KnowledgebaseModule,
        XpertToolsetModule,
        XpertProjectModule,
        XpertModule
    ],
    controllers: [ChatController],
    providers: [
        ChatEventsGateway,
        ConversationTitleService,
        SpeechToTextService,
        PluginSpeechToTextPermissionService,
        { provide: SPEECH_TO_TEXT_SERVICE_TOKEN, useExisting: PluginSpeechToTextPermissionService },
        ...CommandHandlers
    ],
    exports: [SpeechToTextService, SPEECH_TO_TEXT_SERVICE_TOKEN]
})
export class ChatModule {
    constructor() {
        registerSpeechToTextPluginServicePermissionHandler()
    }
}
