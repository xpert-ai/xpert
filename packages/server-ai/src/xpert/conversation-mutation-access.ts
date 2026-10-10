import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { IChatConversation } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { isGroupRuntime } from '../chat-group/group-runtime-context'
import type { XpertProjectService } from '../xpert-project/project.service'
import type { PublishedXpertAccessService } from './published-xpert-access.service'

/** Persisted target plus requested bindings; actor and dispatch scope always come from trusted context. */
export interface ConversationMutationInput {
    conversation: IChatConversation
    requestedXpertId?: string | null
    requestProjectId?: string
    optionProjectId?: string
}

/** Keep existing Assistant-family and Project checks when dispatch authorizes a shared private runtime. */
export async function assertConversationMutationAccess(
    input: ConversationMutationInput,
    publishedAccess: Pick<PublishedXpertAccessService, 'getAccessiblePublishedXpertFamilyIds'>,
    projectService?: Pick<XpertProjectService, 'assertRuntimeAccess'>
) {
    const { conversation, requestedXpertId } = input
    // The public group is never an execution target. Its private runtime is writable only inside verified dispatch.
    if (
        conversation.purpose === 'group' ||
        (conversation.purpose === 'group_assistant_runtime' && !isGroupRuntime(conversation.id))
    ) {
        throw new ForbiddenException(
            t('server-ai:Error.ConversationAccessDenied', {
                defaultValue: 'You do not have access to this conversation'
            })
        )
    }
    const persistedXpertId = conversation.xpertId?.trim() || undefined
    const normalizedRequestedXpertId = requestedXpertId?.trim() || undefined
    const sameXpertFamily =
        persistedXpertId && normalizedRequestedXpertId
            ? persistedXpertId === normalizedRequestedXpertId ||
              (await publishedAccess.getAccessiblePublishedXpertFamilyIds(normalizedRequestedXpertId)).includes(
                  persistedXpertId
              )
            : false
    if (!sameXpertFamily) {
        throw new BadRequestException(
            t('server-ai:Error.RequestedXpertConversationMismatch', {
                defaultValue: 'The requested Xpert does not match the conversation Xpert'
            })
        )
    }

    const persistedProjectId = conversation.projectId?.trim() || undefined
    const optionProjectId = input.optionProjectId?.trim() || undefined
    const requestProjectId = input.requestProjectId?.trim() || undefined
    if (
        (optionProjectId && optionProjectId !== persistedProjectId) ||
        (requestProjectId && requestProjectId !== persistedProjectId)
    ) {
        throw new BadRequestException(
            t('server-ai:Error.RequestedProjectConversationMismatch', {
                defaultValue: 'The requested Project does not match the conversation Project'
            })
        )
    }

    if (persistedProjectId) {
        if (!projectService) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectConversationUnavailable', {
                    defaultValue: 'Project conversations are unavailable'
                })
            )
        }
        await projectService.assertRuntimeAccess(persistedProjectId, persistedXpertId)
        return
    }

    if (conversation.purpose === 'group_assistant_runtime' && isGroupRuntime(conversation.id)) return

    const actorUserId = RequestContext.currentUserId()
    if (!actorUserId || conversation.createdById !== actorUserId) {
        throw new ForbiddenException(
            t('server-ai:Error.ConversationAccessDenied', {
                defaultValue: 'You do not have access to this conversation'
            })
        )
    }
}
