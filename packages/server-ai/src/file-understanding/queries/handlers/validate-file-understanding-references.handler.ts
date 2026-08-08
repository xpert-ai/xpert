import { BadRequestException, NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { FileAsset, FileChunk } from '../../entities'
import { ValidateFileUnderstandingReferencesQuery } from '../validate-file-understanding-references.query'
import { scopedFileWhere } from './get-file-understanding-status.handler'

const MAX_REFERENCES = 120

@QueryHandler(ValidateFileUnderstandingReferencesQuery)
export class ValidateFileUnderstandingReferencesHandler implements IQueryHandler<ValidateFileUnderstandingReferencesQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly assetRepository: Repository<FileAsset>,
        @InjectRepository(FileChunk)
        private readonly chunkRepository: Repository<FileChunk>
    ) {}

    async execute(query: ValidateFileUnderstandingReferencesQuery) {
        if (!query.references.length || query.references.length > MAX_REFERENCES) {
            throw new BadRequestException(`references must contain between 1 and ${MAX_REFERENCES} items`)
        }
        const fileIds = [...new Set(query.references.map((reference) => reference.fileAssetId))]
        const files = await Promise.all(
            fileIds.map((fileId) => this.assetRepository.findOne({ where: scopedFileWhere(fileId, query.scope) }))
        )
        if (files.some((file) => !file)) {
            throw new NotFoundException('One or more file understanding references are outside the current scope')
        }
        const chunkIds = [...new Set(query.references.map((reference) => reference.chunkId))]
        const chunks = await this.chunkRepository.find({ where: { id: In(chunkIds), fileAssetId: In(fileIds) } })
        const chunksByKey = new Map(chunks.map((chunk) => [`${chunk.fileAssetId}:${chunk.id}`, chunk]))
        return query.references.map((reference) => {
            const chunk = chunksByKey.get(`${reference.fileAssetId}:${reference.chunkId}`)
            if (!chunk) {
                throw new NotFoundException('A referenced chunk was not found in its declared FileAsset')
            }
            return {
                fileAssetId: chunk.fileAssetId,
                chunkId: chunk.id,
                orderNo: chunk.orderNo,
                anchor: chunk.anchor,
                excerpt: compactExcerpt(chunk.content, query.excerptLength)
            }
        })
    }
}

function compactExcerpt(content: string, length: number) {
    const normalized = content.replace(/\s+/g, ' ').trim()
    return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized
}
