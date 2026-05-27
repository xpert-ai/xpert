import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
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
        const links = await this.linkRepository.find({ where: { conversationId: query.conversationId } })
        const ids = links.map((link) => link.fileAssetId)
        if (!ids.length) {
            return []
        }
        return this.fileAssetRepository.find({
            where: { id: In(ids) },
            order: { createdAt: 'DESC' }
        })
    }
}
