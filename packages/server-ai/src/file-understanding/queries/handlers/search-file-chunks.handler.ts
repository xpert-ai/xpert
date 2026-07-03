import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import { ILike, In, Repository } from 'typeorm'
import { FileAsset, FileChunk } from '../../entities'
import { FileUnderstandingVectorService } from '../../file-understanding-vector.service'
import { SearchFileChunksQuery } from '../search-file-chunks.query'

@QueryHandler(SearchFileChunksQuery)
export class SearchFileChunksHandler implements IQueryHandler<SearchFileChunksQuery> {
    readonly #logger = new Logger(SearchFileChunksHandler.name)

    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(FileChunk)
        private readonly repository: Repository<FileChunk>,
        private readonly fileVectorService: FileUnderstandingVectorService
    ) {}

    async execute(query: SearchFileChunksQuery) {
        const search = query.input.query?.trim()
        const limit = Math.min(Math.max(query.input.limit ?? 8, 1), 30)
        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][search-handler:called] fileAssetId=${query.input.fileId} hasQuery=${Boolean(search)} limit=${limit}`
        )
        if (!search) {
            this.#logger.debug(
                `[FILE_VECTOR_DEBUG][search:return] fileAssetId=${query.input.fileId} source=ordered-chunks reason=empty-query limit=${limit}`
            )
            return this.repository.find({
                where: {
                    fileAssetId: query.input.fileId
                },
                order: { orderNo: 'ASC' },
                take: limit
            })
        }

        const vectorChunks = await this.searchVectorChunks(query.input.fileId, search, limit)
        if (vectorChunks.length) {
            this.#logger.debug(
                `[FILE_VECTOR_DEBUG][search:return] fileAssetId=${query.input.fileId} source=vector chunks=${vectorChunks.length} query="${search}"`
            )
            return vectorChunks
        }

        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][search:return] fileAssetId=${query.input.fileId} source=text-fallback query="${search}" limit=${limit}`
        )
        return this.searchTextChunks(query.input.fileId, search, limit)
    }

    private async searchVectorChunks(fileId: string, search: string, limit: number) {
        const asset = await this.fileAssetRepository.findOne({ where: { id: fileId } })
        if (!asset) {
            this.#logger.debug(`[FILE_VECTOR_DEBUG][search:skip] fileAssetId=${fileId} reason=file-asset-not-found`)
            return []
        }

        const chunkIds = await this.fileVectorService.searchChunkIds(asset, search, limit)
        if (!chunkIds.length) {
            return []
        }

        const chunks = await this.repository.find({
            where: {
                fileAssetId: fileId,
                id: In(chunkIds)
            }
        })
        const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]))
        const hydratedChunks = chunkIds
            .map((chunkId) => chunksById.get(chunkId))
            .filter((chunk): chunk is FileChunk => !!chunk)
        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][search:hydrate] fileAssetId=${fileId} vectorChunkIds=${chunkIds.length} hydratedChunks=${hydratedChunks.length} chunkIds=${chunkIds.join(',')}`
        )
        return hydratedChunks
    }

    private searchTextChunks(fileId: string, search: string, limit: number) {
        return this.repository.find({
            where: {
                fileAssetId: fileId,
                content: ILike(`%${search}%`)
            },
            order: { orderNo: 'ASC' },
            take: limit
        })
    }
}
