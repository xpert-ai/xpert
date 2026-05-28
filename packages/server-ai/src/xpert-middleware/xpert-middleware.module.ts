import { Module } from '@nestjs/common'
import { ChatConversationModule } from '../chat-conversation'
import { BrowserAutomationMiddleware } from './browser-automation.middleware'
import { ClientToolMiddleware } from './client-tool.middleware'
import { ContextCompressionMiddleware } from './context-compression.middleware'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'
import { OfficeAutomationMiddleware } from './office-automation.middleware'
import { RalphLoopMiddleware } from './ralph-loop.middleware'

@Module({
    imports: [ChatConversationModule],
    providers: [
        BrowserAutomationMiddleware,
        ClientToolMiddleware,
        ContextCompressionMiddleware,
        HumanInTheLoopMiddleware,
        OfficeAutomationMiddleware,
        RalphLoopMiddleware
    ],
    exports: [
        BrowserAutomationMiddleware,
        ClientToolMiddleware,
        ContextCompressionMiddleware,
        HumanInTheLoopMiddleware,
        OfficeAutomationMiddleware,
        RalphLoopMiddleware
    ]
})
export class XpertMiddlewareModule {}
