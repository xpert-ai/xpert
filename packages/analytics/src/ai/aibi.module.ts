import { CopilotCheckpointModule, CopilotKnowledgeModule, CopilotModule, MCPModule, XpertToolsetModule } from '@metad/server-ai'
import { CacheModule, forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ChatBIModelModule } from '../chatbi-model'
import { provideOcap } from '../model/ocap/'
import { CalculatorService } from './toolset/mcp/chatbi'
import { QueryHandlers } from './queries/handlers'
import { SemanticModelModule } from '../model'

/**
 */
@Module({
	imports: [
		CacheModule.register(),
		CqrsModule,
		CopilotModule,
		CopilotCheckpointModule,
		CopilotKnowledgeModule,
		XpertToolsetModule,
		forwardRef(() => SemanticModelModule),
		forwardRef(() => ChatBIModelModule),

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
	providers: [...provideOcap(), ...QueryHandlers, CalculatorService],
	exports: []
})
export class AiBiModule {}
