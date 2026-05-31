import { Query } from '@nestjs/cqrs'

export class GetFileWorkspacePathQuery extends Query<string | null> {
    static readonly type = '[File Understanding] Get file workspace path'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
