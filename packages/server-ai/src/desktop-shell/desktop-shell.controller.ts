import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { DesktopShellAuthService, currentShellScope } from './desktop-shell-auth.service'
import { DesktopShellOperationService } from './desktop-shell-operation.service'
import { shellError } from './desktop-shell.errors'

@ApiTags('Desktop Shell')
@ApiBearerAuth()
@Controller()
export class DesktopShellController {
    constructor(
        private readonly auth: DesktopShellAuthService,
        private readonly operations: DesktopShellOperationService
    ) {}

    @Post('devices') register(@Body() body: unknown) {
        return this.auth.register(body)
    }
    @Post('devices/:id/refresh') refresh(@Param('id') id: string) {
        return this.auth.refresh(id)
    }
    @Post('devices/:id/disable') async disable(@Param('id') id: string) {
        const result = await this.auth.disable(id)
        await this.operations.notify(id)
        return result
    }
    @Post('devices/:id/grants') grant(@Param('id') id: string, @Body() body: unknown) {
        if (!body || typeof body !== 'object' || !('assistantId' in body)) shellError('INVALID_MESSAGE')
        return this.auth.issueGrant(id, body.assistantId, 'threadId' in body ? body.threadId : null)
    }
    @Post('grants/:id/revoke') async revoke(@Param('id') id: string) {
        return this.auth.revokeGrant(id)
    }
    @Get('operations') async list(@Query('deviceId') deviceId: string) {
        const scope = currentShellScope()
        await this.auth.requireDevice(deviceId, scope)
        const operations = await this.auth.operations.find({
            where: { ...scope, deviceId },
            order: { createdAt: 'DESC' },
            take: 20
        })
        return Promise.all(operations.map((op) => this.operations.result(op)))
    }
    @Post('operations/:id/cancel') cancel(@Param('id') id: string) {
        return this.operations.cancel(id, currentShellScope())
    }
}
