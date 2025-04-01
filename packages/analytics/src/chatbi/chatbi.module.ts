import { CopilotCheckpointModule, CopilotKnowledgeModule, CopilotModule, XpertToolsetModule } from '@metad/server-ai'
import { CacheModule, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ChatBIModelModule } from '../chatbi-model'
import { SemanticModelMemberModule } from '../model-member/index'
import { provideOcap } from '../model/ocap/'
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
		ChatBIModelModule,
		CopilotCheckpointModule,
		CopilotKnowledgeModule,
		XpertToolsetModule
	],
	controllers: [],
	providers: [...CommandHandlers, ...QueryHandlers, ...provideOcap()],
	exports: []
})
export class ChatBIModule {}
