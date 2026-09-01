import { BadRequestException, Optional } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { v4 as uuidv4 } from 'uuid'
import {
    AssertChatConversationAccessQuery,
    ChatConversationUpsertCommand,
    GetChatConversationQuery
} from '../../../chat-conversation'
import { ThreadAlreadyExistsException } from '../../../core'
import { PublishedXpertAccessService, XpertPrincipalService } from '../../../xpert'
import {
    applyAssistantScope,
    bindConversationAssistantIfUnbound,
    resolveAssistantForRequest
} from '../../assistant-request-context'
import { getTrustedApiConversationSource } from '../../api-chat-source'
import { ThreadDTO } from '../../dto'
import { assertPublicXpertSessionConversationAccess } from '../../public-xpert-principal'
import { ThreadCreateCommand } from '../thread-create.command'
import { ChatConversationThreadService } from '../../../chat-conversation/conversation-thread.service'

type ThreadAssistantInput = {
    assistant_id?: unknown
}

function normalizeThreadAssistantId(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined
    }
    if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException(
            t('server-ai:Error.InvalidThreadAssistantId', {
                defaultValue: 'Thread assistant_id must be a non-empty string.'
            })
        )
    }

    return value.trim()
}

export function resolveThreadCreateAssistantId(input: ThreadAssistantInput): string | undefined {
    return normalizeThreadAssistantId(input.assistant_id)
}

@CommandHandler(ThreadCreateCommand)
export class ThreadCreateHandler implements ICommandHandler<ThreadCreateCommand> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly xpertPrincipalService?: XpertPrincipalService,
        @Optional() private readonly conversationThreadService?: ChatConversationThreadService
    ) {}

    public async execute(command: ThreadCreateCommand): Promise<ThreadDTO> {
        const input = command.input
        const conversationSource = getTrustedApiConversationSource()
        const assistantId = resolveThreadCreateAssistantId(input)
        const xpert = assistantId
            ? await resolveAssistantForRequest(
                  assistantId,
                  this.publishedXpertAccessService,
                  this.xpertPrincipalService
              )
            : null

        let conversation = null
        if (input.thread_id) {
            conversation = await this.queryBus.execute(
                new GetChatConversationQuery({
                    threadId: input.thread_id
                })
            )
            if (conversation) {
                await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)

                if (input.if_exists === 'raise') {
                    throw new ThreadAlreadyExistsException()
                }
                await this.queryBus.execute(
                    new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute')
                )
            }
        }

        if (xpert) {
            applyAssistantScope(xpert)
        }
        if (!conversation && input.thread_id && xpert) {
            conversation = await this.queryBus.execute(
                new GetChatConversationQuery({
                    threadId: input.thread_id
                })
            )
            if (conversation) {
                await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)

                if (input.if_exists === 'raise') {
                    throw new ThreadAlreadyExistsException()
                }
                await this.queryBus.execute(
                    new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute')
                )
            }
        }
        if (conversation && xpert) {
            conversation = await bindConversationAssistantIfUnbound(
                this.commandBus,
                conversation,
                xpert,
                this.publishedXpertAccessService
            )
        }

        if (!conversation) {
            conversation = await this.commandBus.execute(
                new ChatConversationUpsertCommand({
                    threadId: input.thread_id ?? uuidv4(),
                    title: input.metadata?.title,
                    ...conversationSource,
                    ...(conversationSource.from === 'api'
                        ? { fromEndUserId: input.metadata?.fromEndUserId || undefined }
                        : {}),
                    xpertId: xpert?.id
                })
            )
        }

        const thread = await this.conversationThreadService?.ensurePrimary(conversation)
        return new ThreadDTO(conversation, undefined, thread)
    }
}
