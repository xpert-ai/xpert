import { Query } from '@nestjs/cqrs'
import type { FileAssetStatus, FileParseMode } from '../domain/types'

export type FileUnderstandingScope = {
    tenantId: string
    organizationId?: string | null
    projectId?: string | null
    xpertId?: string | null
}

export type FileUnderstandingStatusResult = {
    fileAssetId: string
    status: FileAssetStatus
    parseMode: FileParseMode
    capabilities: string[]
    chunkCount: number
    indexedChunkCount: number
    vectorIndexStatus: 'pending' | 'ready' | 'failed' | 'unavailable'
    errorCode?: string
    parsedAt?: Date
}

export class GetFileUnderstandingStatusQuery extends Query<FileUnderstandingStatusResult> {
    static readonly type = '[File Understanding] Get scoped understanding status'

    constructor(
        public readonly fileAssetId: string,
        public readonly scope: FileUnderstandingScope
    ) {
        super()
    }
}
