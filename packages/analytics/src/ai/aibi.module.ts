import {
	CopilotCheckpointModule,
	CopilotKnowledgeModule,
	CopilotModule,
	MCPModule,
	XpertToolsetModule
} from '@metad/server-ai'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ANALYTICS_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { ChatBIModelModule } from '../chatbi-model'
import { provideOcap } from '../model/ocap/'
import { CalculatorService } from './toolset/mcp/chatbi'
import { QueryHandlers } from './queries/handlers'
import { SemanticModelModule } from '../model'
import { IndicatorModule } from '../indicator'
import {
	PluginAnalyticsPermissionService,
	registerAnalyticsPluginServicePermissionHandler
} from '../plugin/permissions'

/**
 */
@Module({
	imports: [
		CqrsModule,
		CopilotModule,
		CopilotCheckpointModule,
		CopilotKnowledgeModule,
		XpertToolsetModule,
		forwardRef(() => SemanticModelModule),
		forwardRef(() => IndicatorModule),
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
	providers: [
		{ provide: ANALYTICS_PERMISSION_SERVICE_TOKEN, useExisting: PluginAnalyticsPermissionService },
		PluginAnalyticsPermissionService,
		...provideOcap(),
		...QueryHandlers,
		CalculatorService
	],
	exports: []
})
export class AiBiModule {
	constructor() {
		registerAnalyticsPluginServicePermissionHandler()
	}
}
