import { Query } from '@nestjs/cqrs'
import { FileAssetStatus } from '../domain/types'

export class GetFileParseStatusQuery extends Query<{
    fileId: string
    status: FileAssetStatus
    error?: string
    parsedAt?: Date
}> {
    static readonly type = '[File Understanding] Get file parse status'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
