import { Query } from '@nestjs/cqrs'
import type { FileAsset } from '../entities'

/** Lists the Project FileAssets plus explicit attachments visible to one runtime. */
export class ListProjectFilesQuery extends Query<FileAsset[]> {
    static readonly type = '[File Understanding] List Project files'

    constructor(
        /** Trusted Project scope propagated by the runtime, not by the model. */
        public readonly projectId: string,
        /** Optional conversation whose explicit attachments augment Project files. */
        public readonly conversationId?: string
    ) {
        super()
    }
}
