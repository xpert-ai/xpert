import { Query } from '@nestjs/cqrs'
import type { FileAnchor } from '../domain/types'
import type { FileUnderstandingScope } from './get-file-understanding-status.query'

export type FileUnderstandingReferenceInput = {
    fileAssetId: string
    chunkId: string
}

export type ValidatedFileUnderstandingReference = {
    fileAssetId: string
    chunkId: string
    orderNo: number
    anchor?: FileAnchor
    excerpt: string
}

export class ValidateFileUnderstandingReferencesQuery extends Query<ValidatedFileUnderstandingReference[]> {
    static readonly type = '[File Understanding] Validate scoped chunk references'

    constructor(
        public readonly references: FileUnderstandingReferenceInput[],
        public readonly excerptLength: number,
        public readonly scope: FileUnderstandingScope
    ) {
        super()
    }
}
