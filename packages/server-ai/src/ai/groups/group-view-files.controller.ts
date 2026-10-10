import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, AllowClientSecretBindings } from '@xpert-ai/server-core'
import { Body, Controller, Delete, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { Public, UseValidationPipe, UUIDValidationPipe } from '@xpert-ai/server-core'
import type { Request, Response } from 'express'
import {
    CreateWorkspaceFileAccessGrantDto,
    CreateWorkspaceFileAccessSessionDto
} from '../../workspace-file-access/workspace-file-access.dto'
import { WorkspaceFileAccessService } from '../../workspace-file-access/workspace-file-access.service'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupWorkbenchGuard } from './group-workbench.guard'
import { groupDenied } from '../../chat-group/group.errors'

/** The existing View file sessions keep their owner, scope, grant and cookie checks. */
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
@UseGuards(ApiKeyOrClientSecretAuthGuard, GroupScopeGuard)
@Controller('groups/:groupId/workbench/workspace-files/view-sessions')
export class GroupViewFilesController {
    constructor(
        private readonly scope: GroupWorkbenchGuard,
        private readonly files: WorkspaceFileAccessService
    ) {}
    @Post()
    @UseValidationPipe({ whitelist: true, transform: true })
    async create(
        @Param('groupId', UUIDValidationPipe) groupId: string,
        @Body() body: CreateWorkspaceFileAccessSessionDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ) {
        const context = await this.scope.resolve(groupId)
        if (
            body.hostType !== 'agent' ||
            body.hostId !== context.assistantId ||
            (body.runtimeScope?.conversationId && body.runtimeScope.conversationId !== context.conversationId) ||
            (body.runtimeScope?.projectId && body.runtimeScope.projectId !== context.projectId)
        )
            throw groupDenied()
        const session = await this.files.createSession(
            { ...body, runtimeScope: { conversationId: context.conversationId, projectId: context.projectId } },
            request
        )
        response.cookie(session.cookie.name, session.cookie.value, session.cookie.options)
        return { sessionId: session.sessionId, expiresAt: session.expiresAt }
    }
    @Post(':sessionId/grants')
    @UseValidationPipe({ whitelist: true, transform: true })
    async grant(
        @Param('groupId', UUIDValidationPipe) groupId: string,
        @Param('sessionId', UUIDValidationPipe) sessionId: string,
        @Body() body: CreateWorkspaceFileAccessGrantDto
    ) {
        await this.authorize(groupId, sessionId)
        return this.files.createGrant(sessionId, body)
    }
    @Delete(':sessionId')
    async revoke(
        @Param('groupId', UUIDValidationPipe) groupId: string,
        @Param('sessionId', UUIDValidationPipe) sessionId: string,
        @Res({ passthrough: true }) response: Response
    ) {
        await this.authorize(groupId, sessionId)
        await this.files.revokeSession(sessionId)
        response.clearCookie('xpert_workspace_file_access', { path: this.files.buildCookiePath(sessionId) })
        return { success: true }
    }
    private async authorize(groupId: string, sessionId: string) {
        const context = await this.scope.resolve(groupId)
        await this.files.assertAuthenticatedSessionScope(sessionId, context.assistantId, context)
    }
}
