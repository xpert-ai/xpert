import { BadRequestException, ConflictException } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import {
    RequestContext,
    WidgetActionProvider,
    type IWidgetActionProvider,
    type WidgetActionContext
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assertProjectInteractivePrincipal, XpertProjectFeatureGuard, XpertProjectPermissionGuard } from './guards'
import { ConversationProjectMoveService } from './services/conversation-project-move'

@WidgetActionProvider('project.move')
export class ProjectMoveActions implements IWidgetActionProvider {
    readonly actions = {
        confirm: {
            widgetSource: 'receipt' as const,
            execute: (context: WidgetActionContext) => this.confirm(context)
        },
        cancel: {
            widgetSource: 'receipt' as const,
            execute: (context: WidgetActionContext) => this.cancel(context)
        }
    }

    constructor(
        private readonly moves: ConversationProjectMoveService,
        private readonly feature: XpertProjectFeatureGuard,
        private readonly permissions: XpertProjectPermissionGuard
    ) {}

    private async offer({ threadId, messageId, widgetId }: WidgetActionContext) {
        assertProjectInteractivePrincipal(RequestContext.currentApiPrincipal())
        await this.feature.canActivate()
        await this.permissions.assertPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
        const move = await this.moves.pending(threadId)
        if (move && (move.assistantMessageId !== messageId || move.requestId !== widgetId))
            throw new ConflictException('This project selection is no longer available')
        return move
    }
    private async confirm(identity: WidgetActionContext) {
        const { fields } = identity
        const move = await this.offer(identity)
        if (!move) throw new ConflictException('This project selection is no longer available')
        const mode = fields?.mode
        if (mode !== 'existing' && mode !== 'create') throw new BadRequestException('Invalid project selection mode')
        const value = typeof fields.target === 'string' ? fields.target.trim() : ''
        if (!value || (mode === 'create' && value.length > 240))
            throw new BadRequestException(
                t('server-ai:ProjectMove.' + (mode === 'create' ? 'NameRequired' : 'TargetRequired'), {
                    lng: RequestContext.getLanguageCode()
                })
            )
        await this.moves.confirm({
            requestId: move.requestId,
            threadId: move.threadId,
            moveFromConversationId: move.conversationId,
            shareHistory: true,
            target: mode === 'existing' ? { mode, projectId: value } : { mode, name: value }
        })
        return { refresh: 'thread' as const }
    }
    private async cancel(identity: WidgetActionContext) {
        const move = await this.offer(identity)
        if (move?.projectId) throw new ConflictException('Conversation already moved')
        if (move) await this.moves.dismiss(move.threadId, move.requestId)
        return { refresh: 'thread' as const }
    }
}
