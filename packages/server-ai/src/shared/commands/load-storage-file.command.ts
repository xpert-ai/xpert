import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated Use file-understanding parser/query services for new file reads.
 * Kept for legacy StorageFile-based document loading.
 */
export class LoadStorageFileCommand implements ICommand {
    static readonly type = '[Shared] Load StorageFile'

    constructor(public readonly id: string) {}
}
