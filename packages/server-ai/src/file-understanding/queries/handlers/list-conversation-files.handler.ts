import { ForbiddenException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { ConversationFileLink, FileAsset } from '../../entities'
import { FileAssetAccessService } from '../../file-asset-access.service'
import { ListConversationFilesQuery } from '../list-conversation-files.query'

@QueryHandler(ListConversationFilesQuery)
export class ListConversationFilesHandler implements IQueryHandler<ListConversationFilesQuery> {
    constructor(
        @InjectRepository(ConversationFileLink)
        private readonly linkRepository: Repository<ConversationFileLink>,
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        private readonly fileAssetAccessService: FileAssetAccessService
    ) {}

    async execute(query: ListConversationFilesQuery) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        // File links and assets are filtered independently so a leaked link id
        // cannot cross tenant or organization boundaries.
        const scope = { tenantId, organizationId: organizationId ?? IsNull() }
        const links = await this.linkRepository.find({ where: { ...scope, conversationId: query.conversationId } })
        const ids = links.map((link) => link.fileAssetId)
        if (!ids.length) {
            return []
        }
        const files = await this.fileAssetRepository.find({
            where: { ...scope, id: In(ids) },
            order: { createdAt: 'DESC' }
        })
        const authorized = await Promise.all(
            files.map(async (file) => {
                try {
                    return (
                        await this.fileAssetAccessService.resolve({
                            locator: { fileAssetId: file.id },
                            authority: { kind: 'conversation', conversationId: query.conversationId },
                            operation: 'read'
                        })
                    ).asset
                } catch (error) {
                    if (error instanceof ForbiddenException) {
                        return null
                    }
                    throw error
                }
            })
        )
        return authorized.filter((file): file is FileAsset => file !== null)
    }
}
