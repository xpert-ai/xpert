import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { Observable } from 'rxjs'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { PublishedXpertAccessService, XpertChatCommand } from '../../../xpert'
import { ChatCommonCommand } from '../chat-common.command'
import { ChatCommand } from '../chat.command'

@CommandHandler(ChatCommand)
export class ChatCommandHandler implements ICommandHandler<ChatCommand> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {}

    public async execute(command: ChatCommand): Promise<Observable<MessageEvent>> {
        const requestProjectId =
            'projectId' in command.request && typeof command.request.projectId === 'string'
                ? command.request.projectId.trim() || undefined
                : undefined
        const optionProjectId = command.options.projectId?.trim() || undefined
        if (requestProjectId && optionProjectId && requestProjectId !== optionProjectId) {
            throw this.projectMismatch()
        }

        let options = command.options
        if (command.request.conversationId) {
            const conversation = await this.queryBus.execute(
                new GetChatConversationQuery({ id: command.request.conversationId })
            )
            const persistedProjectId = conversation.projectId?.trim() || undefined
            const persistedXpertId = conversation.xpertId?.trim() || undefined
            const requestedProjectId = optionProjectId ?? requestProjectId
            const requestedXpertId = command.options.xpertId?.trim() || undefined

            if (requestedProjectId && requestedProjectId !== persistedProjectId) {
                throw this.projectMismatch()
            }
            if (requestedXpertId && requestedXpertId !== persistedXpertId) {
                const familyIds =
                    await this.publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds(requestedXpertId)
                if (!persistedXpertId || !familyIds.includes(persistedXpertId)) {
                    throw new BadRequestException(
                        t('server-ai:Error.RequestedXpertConversationMismatch', {
                            defaultValue: 'The requested Xpert does not match the conversation Xpert'
                        })
                    )
                }
            }
            if (persistedProjectId && !persistedXpertId) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectXpertSelectionRequired', {
                        defaultValue: 'A Project Xpert is required.'
                    })
                )
            }
            if (!persistedXpertId && conversation.createdById !== command.options.user.id) {
                throw new ForbiddenException(
                    t('server-ai:Error.ConversationAccessDenied', {
                        defaultValue: 'You do not have access to this conversation'
                    })
                )
            }

            options = {
                ...command.options,
                ...(persistedProjectId ? { projectId: persistedProjectId } : {}),
                ...(persistedXpertId ? { xpertId: requestedXpertId ?? persistedXpertId } : {})
            }
        }

        const isProjectConversation =
            Boolean(options.projectId) || ('projectId' in command.request && Boolean(command.request.projectId))
        if (isProjectConversation && !options.xpertId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectXpertSelectionRequired', {
                    defaultValue: 'A Project Xpert is required.'
                })
            )
        }
        if (options.xpertId) {
            return await this.commandBus.execute(new XpertChatCommand(command.request, options))
        }
        return await this.commandBus.execute(new ChatCommonCommand(command.request, options))
    }

    private projectMismatch() {
        return new BadRequestException(
            t('server-ai:Error.RequestedProjectConversationMismatch', {
                defaultValue: 'The requested Project does not match the conversation Project'
            })
        )
    }
}
