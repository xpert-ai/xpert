import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import { In, Repository } from 'typeorm'
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
        // Semantic search stays tightly bounded; ordered listing may request one
        // look-ahead row so callers can expose hasMore without a count query.
        const limit = Math.min(Math.max(query.input.limit ?? 8, 1), search ? 30 : 101)
        const offset = Math.max(query.input.offset ?? 0, 0)
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
                skip: offset,
                take: limit
            })
        }

        const [vectorChunks, textChunks] = await Promise.all([
            this.searchVectorChunks(query.input.fileId, search, limit * 2),
            this.searchTextChunks(query.input.fileId, search, limit * 2)
        ])
        const chunks = reciprocalRankMerge(vectorChunks, textChunks).slice(0, limit)
        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][search:return] fileAssetId=${query.input.fileId} source=hybrid vector=${vectorChunks.length} keyword=${textChunks.length} chunks=${chunks.length} query="${search}"`
        )
        return chunks
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
        const terms = tokenizeSearch(search)
        const query = this.repository
            .createQueryBuilder('chunk')
            .where('chunk.fileAssetId = :fileId', { fileId })
            .orderBy('chunk.orderNo', 'ASC')
            .take(limit)
        if (terms.length) {
            query.andWhere(
                `(${terms.map((_, index) => `chunk.content ILIKE :term${index}`).join(' OR ')})`,
                Object.fromEntries(terms.map((term, index) => [`term${index}`, `%${term}%`]))
            )
        }
        return query.getMany()
    }
}

function tokenizeSearch(search: string) {
    const tokens = search
        .split(/[\s,，。;；:：、]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    return [...new Set(tokens.length ? tokens : [search])].slice(0, 6)
}

function reciprocalRankMerge(vectorChunks: FileChunk[], textChunks: FileChunk[]) {
    const scores = new Map<string, number>()
    const chunks = new Map<string, FileChunk>()
    for (const list of [vectorChunks, textChunks]) {
        list.forEach((chunk, index) => {
            chunks.set(chunk.id, chunk)
            scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + 1 / (60 + index + 1))
        })
    }
    return [...chunks.values()].sort((left, right) => {
        const scoreDifference = (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0)
        return scoreDifference || left.orderNo - right.orderNo
    })
}
