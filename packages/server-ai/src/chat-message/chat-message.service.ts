import { StorageFile, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import type { IStorageFile } from '@xpert-ai/contracts'
import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries'
import type { ChatConversationAccessOperation } from '../chat-conversation/conversation.service'
import type { AuthorizedFileAsset } from '../file-understanding/file-asset-access.service'
import type { FileAsset } from '../file-understanding/entities'
import { GetOwnedStorageFileQuery, ResolveAuthorizedFileAssetQuery } from '../file-understanding/queries'
import { ChatMessage } from './chat-message.entity'

@Injectable()
export class ChatMessageService extends TenantOrganizationAwareCrudService<ChatMessage> {
    private readonly logger = new Logger(ChatMessageService.name)

    constructor(
        @InjectRepository(ChatMessage)
        repository: Repository<ChatMessage>,
        readonly commandBus: CommandBus,
        readonly queryBus: QueryBus
    ) {
        super(repository)
    }

    async deleteByIds(ids: string[]) {
        for await (const id of ids) {
            await this.softRemove(id)
        }
    }

    async findOneAuthorized(
        id: string,
        options?: { relations?: string[]; operation?: ChatConversationAccessOperation }
    ) {
        const scopedMessage = await this.findOne(id)
        if (!scopedMessage?.conversationId) {
            throw new ForbiddenException()
        }
        await this.queryBus.execute(
            new AssertChatConversationAccessQuery({ id: scopedMessage.conversationId }, options?.operation ?? 'read')
        )
        if (!options?.relations?.length) {
            return scopedMessage
        }

        const message = await this.findOne(id, { relations: options.relations })
        if (message.conversationId !== scopedMessage.conversationId) {
            throw new ForbiddenException()
        }
        return message
    }

    /** Replace client-visible file relations with centrally authorized canonical entities. */
    async filterAuthorizedFileRelations(message: ChatMessage, conversationId: string) {
        if (message.conversationId !== conversationId) {
            throw new ForbiddenException()
        }

        const attachments =
            message.attachments === undefined
                ? undefined
                : await this.resolveAuthorizedLegacyAttachments(message.attachments)
        const fileAssets =
            message.fileAssets === undefined
                ? undefined
                : await this.resolveAuthorizedFileAssets(message.fileAssets, conversationId)

        return {
            ...message,
            ...(attachments !== undefined ? { attachments } : {}),
            ...(fileAssets !== undefined ? { fileAssets } : {})
        }
    }

    private async resolveAuthorizedLegacyAttachments(attachments: IStorageFile[]): Promise<IStorageFile[]> {
        const resolved: IStorageFile[] = []
        for (const attachment of attachments) {
            try {
                resolved.push(
                    await this.queryBus.execute<GetOwnedStorageFileQuery, StorageFile>(
                        new GetOwnedStorageFileQuery(attachment.id)
                    )
                )
            } catch (error) {
                if (!(error instanceof ForbiddenException)) {
                    throw error
                }
            }
        }
        return resolved
    }

    private async resolveAuthorizedFileAssets(fileAssets: FileAsset[], conversationId: string): Promise<FileAsset[]> {
        const resolved: FileAsset[] = []
        for (const fileAsset of fileAssets) {
            try {
                const authorized = await this.queryBus.execute<ResolveAuthorizedFileAssetQuery, AuthorizedFileAsset>(
                    new ResolveAuthorizedFileAssetQuery({
                        locator: { fileAssetId: fileAsset.id },
                        authority: { kind: 'conversation', conversationId },
                        operation: 'read'
                    })
                )
                resolved.push(authorized.asset)
            } catch (error) {
                if (!(error instanceof ForbiddenException)) {
                    throw error
                }
            }
        }
        return resolved
    }
}
