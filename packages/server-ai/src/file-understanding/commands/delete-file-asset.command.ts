import { Command } from '@nestjs/cqrs'

/** Remove one asset; an archived Project purge uses its dedicated owner and binding checks. */
export class DeleteFileAssetCommand extends Command<void> {
    static readonly type = '[File Understanding] Delete file asset'

    constructor(
        public readonly fileAssetId: string,
        public readonly purge?: { purgeProjectId: string }
    ) {
        super()
    }
}
