import { Query } from '@nestjs/cqrs'
import type { PageImagePreviewFile } from '../domain/page-image-artifact'
import type { FileAnchor } from '../domain/types'

export type ListFilePageImagesOptions = {
    pageStart?: number
    pageEnd?: number
    limit?: number
}

export type FilePageImageResult = {
    orderNo: number
    mimeType?: string
    anchor?: FileAnchor
    file: PageImagePreviewFile
}

export class ListFilePageImagesQuery extends Query<FilePageImageResult[]> {
    static readonly type = '[File Understanding] List file page images'

    constructor(
        public readonly fileAssetId: string,
        public readonly options?: ListFilePageImagesOptions
    ) {
        super()
    }
}
