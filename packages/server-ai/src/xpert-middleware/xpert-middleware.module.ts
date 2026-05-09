import { Module } from '@nestjs/common'
import { BrowserAutomationMiddleware } from './browser-automation.middleware'
import { ClientToolMiddleware } from './client-tool.middleware'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'
import { RalphLoopMiddleware } from './ralph-loop.middleware'

@Module({
    providers: [BrowserAutomationMiddleware, ClientToolMiddleware, HumanInTheLoopMiddleware, RalphLoopMiddleware],
    exports: [BrowserAutomationMiddleware, ClientToolMiddleware, HumanInTheLoopMiddleware, RalphLoopMiddleware]
})
export class XpertMiddlewareModule {}
