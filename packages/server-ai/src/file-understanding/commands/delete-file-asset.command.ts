import { Command } from '@nestjs/cqrs'

export class DeleteFileAssetCommand extends Command<void> {
    static readonly type = '[File Understanding] Delete file asset'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
