import { Module } from '@nestjs/common'
import { BrowserAutomationMiddleware } from './browser-automation.middleware'
import { ClientToolMiddleware } from './client-tool.middleware'
import { ContextCompressionMiddleware } from './context-compression.middleware'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'
import { RalphLoopMiddleware } from './ralph-loop.middleware'

@Module({
    providers: [
        BrowserAutomationMiddleware,
        ClientToolMiddleware,
        ContextCompressionMiddleware,
        HumanInTheLoopMiddleware,
        RalphLoopMiddleware
    ],
    exports: [
        BrowserAutomationMiddleware,
        ClientToolMiddleware,
        ContextCompressionMiddleware,
        HumanInTheLoopMiddleware,
        RalphLoopMiddleware
    ]
})
export class XpertMiddlewareModule {}
