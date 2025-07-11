import { CopilotCheckpointModule, CopilotKnowledgeModule, CopilotModule, MCPModule, XpertToolsetModule } from '@metad/server-ai'
import { CacheModule, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ChatBIModelModule } from '../chatbi-model'
import { SemanticModelMemberModule } from '../model-member/index'
import { provideOcap } from '../model/ocap/'
import { CalculatorService } from './toolset/mcp/chatbi'

/**
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
		XpertToolsetModule,

		MCPModule.register({
			name: 'MyMCPServer',
			version: '1.0.0',
			// Optional configuration
			sseEndpoint: 'mcp/sse',
			messagesEndpoint: 'mcp/messages',
			globalApiPrefix: '/api',
			capabilities: {
				// Your server capabilities
			}
		})
	],
	controllers: [],
	providers: [...provideOcap(), CalculatorService],
	exports: []
})
export class AiBiModule {}
