import { Module } from '@nestjs/common'
import { BrowserAutomationMiddleware } from './browser-automation.middleware'
import { ClientToolMiddleware } from './client-tool.middleware'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'

@Module({
    providers: [BrowserAutomationMiddleware, ClientToolMiddleware, HumanInTheLoopMiddleware],
    exports: [BrowserAutomationMiddleware, ClientToolMiddleware, HumanInTheLoopMiddleware]
})
export class XpertMiddlewareModule {}
