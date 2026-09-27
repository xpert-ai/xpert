import {
    Body,
    Controller,
    Get,
    HttpException,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TSandboxManagedServiceStartInput } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, Public, TransformInterceptor } from '@xpert-ai/server-core'
import { Request, Response } from 'express'
import { SandboxManagedServiceService } from '../sandbox/sandbox-managed-service.service'
import { SandboxManagedServiceError } from '../sandbox/sandbox-managed-service.error'
import { SandboxPreviewSessionService } from '../sandbox/sandbox-preview-session.service'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { AssistantThreadScopeGuard } from './assistant-thread-scope.guard'

/** ChatKit uses the AI API; platform sandbox routes keep their existing login guards. */
@ApiTags('AI/Sandbox')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard, AssistantThreadScopeGuard)
@UseInterceptors(TransformInterceptor)
@Controller('sandbox/threads/:threadId/services')
export class SandboxRuntimeController {
    constructor(
        private readonly services: SandboxManagedServiceService,
        private readonly previews: SandboxPreviewSessionService,
        private readonly organizationScope: SuperAdminOrganizationScopeService
    ) {}

    @Get()
    list(@Param('threadId') threadId: string, @Query('organizationId') organizationId?: string) {
        return this.run(organizationId, () => this.services.listByThreadId(threadId))
    }

    @Get(':serviceId')
    get(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ) {
        return this.run(organizationId, () => this.services.getByThreadId(threadId, serviceId))
    }

    @Post('start')
    start(
        @Param('threadId') threadId: string,
        @Body() input: TSandboxManagedServiceStartInput,
        @Query('organizationId') organizationId?: string
    ) {
        return this.run(organizationId, () => this.services.startByThreadId(threadId, input))
    }

    @Get(':serviceId/logs')
    logs(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('tail') tail?: string,
        @Query('organizationId') organizationId?: string
    ) {
        return this.run(organizationId, () =>
            this.services.getLogsByThreadId(threadId, serviceId, tail ? Number.parseInt(tail, 10) : undefined)
        )
    }

    @Post(':serviceId/stop')
    stop(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ) {
        return this.run(organizationId, () => this.services.stopByThreadId(threadId, serviceId))
    }

    @Post(':serviceId/restart')
    restart(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Query('organizationId') organizationId?: string
    ) {
        return this.run(organizationId, () => this.services.restartByThreadId(threadId, serviceId))
    }

    @Post(':serviceId/preview-session')
    async previewSession(
        @Param('threadId') threadId: string,
        @Param('serviceId') serviceId: string,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Query('organizationId') organizationId?: string
    ) {
        const service = await this.run(organizationId, () => this.services.getByThreadId(threadId, serviceId))
        const session = this.previews.createSession(service, {
            secure: request.secure || request.headers['x-forwarded-proto'] === 'https'
        })
        // Preview content continues to use the existing cookie-protected proxy.
        response.cookie(session.cookie.name, session.cookie.value, session.cookie.options)
        return { expiresAt: session.expiresAt, previewUrl: session.previewUrl }
    }

    private async run<T>(organizationId: string | undefined, action: () => Promise<T>): Promise<T> {
        try {
            return await this.organizationScope.run(organizationId, action)
        } catch (error) {
            if (error instanceof SandboxManagedServiceError) {
                throw new HttpException({ code: error.code, message: error.message }, error.statusCode)
            }
            throw error
        }
    }
}
