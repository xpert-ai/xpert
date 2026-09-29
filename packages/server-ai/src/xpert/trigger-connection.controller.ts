import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions } from '@xpert-ai/server-core'
import { XpertGuard } from './guards/xpert.guard'
import { XpertTriggerConnectionService } from './trigger-connection.service'

@Controller(':id/trigger-connections')
@UseGuards(XpertGuard)
export class XpertTriggerConnectionController {
    constructor(private readonly connections: XpertTriggerConnectionService) {}

    @Get()
    statuses(@Param('id') id: string) {
        return this.connections.statuses(id)
    }

    @Post(':provider/qr')
    @UseGuards(PermissionGuard)
    @Permissions(PermissionsEnum.INTEGRATION_EDIT)
    begin(@Param('id') id: string, @Param('provider') provider: string) {
        return this.connections.begin(id, provider)
    }

    @Get(':provider/qr/:session')
    poll(@Param('id') id: string, @Param('provider') provider: string, @Param('session') session: string) {
        return this.connections.poll(id, provider, session)
    }

    @Post(':provider/qr/:session/complete')
    @UseGuards(PermissionGuard)
    @Permissions(PermissionsEnum.INTEGRATION_EDIT)
    complete(@Param('id') id: string, @Param('provider') provider: string, @Param('session') session: string) {
        return this.connections.complete(id, provider, session)
    }

    @Delete(':provider/qr/:session')
    cancel(@Param('id') id: string, @Param('provider') provider: string, @Param('session') session: string) {
        return this.connections.cancel(id, provider, session)
    }

    @Delete(':provider')
    disconnect(@Param('id') id: string, @Param('provider') provider: string) {
        return this.connections.disconnect(id, provider)
    }
}
