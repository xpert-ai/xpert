import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createPageImagePreviewFile } from '../../domain/page-image-artifact'
import { FileArtifact } from '../../entities'
import type { FilePageImageResult } from '../list-file-page-images.query'
import { ListFilePageImagesQuery } from '../list-file-page-images.query'

const DEFAULT_FILE_PAGE_IMAGE_LIMIT = 300
const MAX_FILE_PAGE_IMAGE_LIMIT = 300

@QueryHandler(ListFilePageImagesQuery)
export class ListFilePageImagesHandler implements IQueryHandler<ListFilePageImagesQuery> {
    constructor(
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>
    ) {}

    async execute(query: ListFilePageImagesQuery) {
        const artifacts = await this.fileArtifactRepository.find({
            where: {
                fileAssetId: query.fileAssetId,
                kind: 'page_image'
            },
            select: {
                kind: true,
                orderNo: true,
                mimeType: true,
                anchor: true,
                metadata: true
            },
            order: { orderNo: 'ASC' }
        })
        const pageStart = normalizePositiveInteger(query.options?.pageStart)
        const pageEnd = normalizePositiveInteger(query.options?.pageEnd)
        const limit = normalizeLimit(query.options?.limit)
        const pageImages: FilePageImageResult[] = []
        for (const artifact of artifacts) {
            const page = artifact.anchor?.page
            if (pageStart !== undefined && (typeof page !== 'number' || page < pageStart)) {
                continue
            }
            if (pageEnd !== undefined && (typeof page !== 'number' || page > pageEnd)) {
                continue
            }
            const file = createPageImagePreviewFile(artifact.metadata)
            if (!file) {
                continue
            }
            pageImages.push({
                orderNo: artifact.orderNo,
                mimeType: artifact.mimeType,
                anchor: artifact.anchor,
                file
            })
            if (pageImages.length >= limit) {
                break
            }
        }
        return pageImages
    }
}

function normalizePositiveInteger(value: number | undefined) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function normalizeLimit(value: number | undefined) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
        ? Math.min(value, MAX_FILE_PAGE_IMAGE_LIMIT)
        : DEFAULT_FILE_PAGE_IMAGE_LIMIT
}
