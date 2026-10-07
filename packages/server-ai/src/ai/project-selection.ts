import type { IChatConversation, IXpert, ProjectSelection, TXpertChatSendRequest } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import z from 'zod'

export const projectSelectionSchema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }).strict(),
    z.object({ mode: z.literal('auto-new') }).strict(),
    z.object({ mode: z.literal('existing'), projectId: z.string().trim().min(1) }).strict()
])

/** Explicit intent wins over incidental Workbench context; saved conversations cannot move. */
export function resolveSendProjectSelection(
    request: TXpertChatSendRequest,
    conversation: IChatConversation,
    xpert: IXpert,
    contextProjectId?: string
): { projectId?: string; selection?: ProjectSelection } {
    const savedSelection = conversation.options?.projectSelection
    if (savedSelection?.mode === 'none' && request.projectSelection?.mode === 'existing') {
        throw new BadRequestException(
            t('server-ai:Error.ConversationProjectImmutable', {
                defaultValue: 'A conversation cannot be moved to another Project'
            })
        )
    }
    const selection = savedSelection?.mode === 'none' ? savedSelection : (request.projectSelection ?? savedSelection)
    if (conversation.projectId) {
        if (
            selection?.mode === 'none' ||
            (selection?.mode === 'existing' && selection.projectId !== conversation.projectId) ||
            (request.projectId && request.projectId !== conversation.projectId)
        ) {
            throw new BadRequestException(
                t('server-ai:Error.ConversationProjectImmutable', {
                    defaultValue: 'A conversation cannot be moved to another Project'
                })
            )
        }
        return { projectId: conversation.projectId, selection: { mode: 'existing', projectId: conversation.projectId } }
    }
    if (selection?.mode === 'none') return { selection }
    if (selection?.mode === 'auto-new') {
        const onMissing = xpert.options?.workspaceScope?.onMissing
        if (onMissing !== 'create' && onMissing !== 'confirm') {
            throw new BadRequestException(
                t('server-ai:Error.ProjectAutoCreateUnavailable', {
                    defaultValue: 'This Assistant does not support automatic Project creation'
                })
            )
        }
        return { selection }
    }
    if (selection?.mode === 'existing') return { projectId: selection.projectId, selection }
    return { projectId: request.projectId ?? contextProjectId }
}

/** Remove stale host scope before forwarding explicit user intent into Agent tools. */
export function clearContextProject(context?: Record<string, unknown>) {
    if (!context) return context
    const { projectId: _projectId, ...rest } = context
    const env = rest.env
    if (env && typeof env === 'object' && !Array.isArray(env) && 'projectId' in env) {
        const { projectId: _envProjectId, ...otherEnv } = env
        return { ...rest, env: otherEnv }
    }
    return rest
}
