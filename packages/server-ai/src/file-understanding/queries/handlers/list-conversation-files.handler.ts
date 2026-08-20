import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { ConversationFileLink, FileAsset } from '../../entities'
import { ListConversationFilesQuery } from '../list-conversation-files.query'

@QueryHandler(ListConversationFilesQuery)
export class ListConversationFilesHandler implements IQueryHandler<ListConversationFilesQuery> {
    constructor(
        @InjectRepository(ConversationFileLink)
        private readonly linkRepository: Repository<ConversationFileLink>,
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>
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
        return this.fileAssetRepository.find({
            where: { ...scope, id: In(ids) },
            order: { createdAt: 'DESC' }
        })
    }
}
