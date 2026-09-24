import { Global, Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule, TenantModule } from '@xpert-ai/server-core'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { DesktopShellMiddleware } from '../xpert-middleware/desktop-shell.middleware'
import { DesktopShellDevice, DesktopShellGrant, DesktopShellOperation } from './desktop-shell.entities'
import { DesktopShellAuthService } from './desktop-shell-auth.service'
import { DesktopShellOperationService } from './desktop-shell-operation.service'
import { DesktopShellGateway } from './desktop-shell.gateway'
import { DesktopShellController } from './desktop-shell.controller'

@Global()
@Module({
    imports: [
        RouterModule.register([{ path: '/desktop-shell', module: DesktopShellModule }]),
        CqrsModule,
        TenantModule,
        RedisModule,
        TypeOrmModule.forFeature([DesktopShellDevice, DesktopShellGrant, DesktopShellOperation, ChatConversationThread])
    ],
    controllers: [DesktopShellController],
    providers: [DesktopShellAuthService, DesktopShellOperationService, DesktopShellGateway, DesktopShellMiddleware],
    exports: [DesktopShellAuthService, DesktopShellOperationService]
})
export class DesktopShellModule {}
