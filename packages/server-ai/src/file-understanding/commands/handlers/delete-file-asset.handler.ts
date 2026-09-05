import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { FileAssetDeletionService } from '../../file-asset-deletion.service'
import { DeleteFileAssetCommand } from '../delete-file-asset.command'

@CommandHandler(DeleteFileAssetCommand)
export class DeleteFileAssetHandler implements ICommandHandler<DeleteFileAssetCommand> {
    constructor(private readonly deletion: FileAssetDeletionService) {}

    async execute(command: DeleteFileAssetCommand): Promise<void> {
        await this.deletion.delete(command.fileAssetId)
    }
}
