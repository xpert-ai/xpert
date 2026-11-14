import { Module } from '@nestjs/common'
import { McpAppToolsMiddleware } from './mcp-app-tools.middleware'
import { ChatConversationModule } from '../chat-conversation'
import { BrowserAutomationMiddleware } from './browser-automation.middleware'
import { ClientEffectMiddleware } from './client-effect.middleware'
import { ClientToolMiddleware } from './client-tool.middleware'
import { ContextCompressionMiddleware } from './context-compression.middleware'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'
import { LLMToolSelectorNameMiddleware } from './llm-tool-selector.middleware'
import { OfficeAutomationMiddleware } from './office-automation.middleware'
import { RalphLoopMiddleware } from './ralph-loop.middleware'
import { StructuredOutputMiddleware } from './structured-output.middleware'
import { SummarizationMiddleware } from './summarization.middleware'
import { TodoListMiddleware } from './todo-list.middleware'
import { ThreadReferenceMiddleware } from './thread-reference.middleware'
import { RequestUserInputMiddleware } from './request-user-input.middleware'

@Module({
    imports: [ChatConversationModule],
    providers: [
        McpAppToolsMiddleware,
        ThreadReferenceMiddleware,
        BrowserAutomationMiddleware,
        ClientEffectMiddleware,
        ClientToolMiddleware,
        RequestUserInputMiddleware,
        ContextCompressionMiddleware,
        HumanInTheLoopMiddleware,
        LLMToolSelectorNameMiddleware,
        OfficeAutomationMiddleware,
        RalphLoopMiddleware,
        StructuredOutputMiddleware,
        SummarizationMiddleware,
        TodoListMiddleware
    ],
    exports: [
        McpAppToolsMiddleware,
        ThreadReferenceMiddleware,
        BrowserAutomationMiddleware,
        ClientEffectMiddleware,
        ClientToolMiddleware,
        RequestUserInputMiddleware,
        ContextCompressionMiddleware,
        HumanInTheLoopMiddleware,
        LLMToolSelectorNameMiddleware,
        OfficeAutomationMiddleware,
        RalphLoopMiddleware,
        StructuredOutputMiddleware,
        SummarizationMiddleware,
        TodoListMiddleware
    ]
})
export class XpertMiddlewareModule {}
