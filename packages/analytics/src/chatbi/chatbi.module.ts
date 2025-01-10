import { CopilotCheckpointModule, CopilotKnowledgeModule, CopilotModule, XpertToolsetModule } from '@metad/server-ai'
import { CacheModule, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ChatBIModelModule } from '../chatbi-model'
import { SemanticModelMemberModule } from '../model-member/index'
import { OcapModule } from '../model/ocap'
import { provideOcap } from '../model/ocap/'
import { ChatBIService } from './chatbi.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'

/**
 * @deprecated Use ChatBI toolset
 */
@Module({
	imports: [
		CacheModule.register(),
		CqrsModule,
		CopilotModule,
		SemanticModelMemberModule,
		OcapModule,
		ChatBIModelModule,
		CopilotCheckpointModule,
		CopilotKnowledgeModule,
		XpertToolsetModule
	],
	controllers: [],
	providers: [ChatBIService, ...CommandHandlers, ...QueryHandlers, ...provideOcap()],
	exports: []
})
export class ChatBIModule {}
