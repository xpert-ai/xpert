import { Command } from '@nestjs/cqrs'
import { ParsedFileArtifact } from '../domain/types'
import { FileArtifact } from '../entities'

export class CreateFileArtifactsCommand extends Command<FileArtifact[]> {
    static readonly type = '[File Understanding] Create file artifacts'

    constructor(
        public readonly fileAssetId: string,
        public readonly artifacts: ParsedFileArtifact[]
    ) {
        super()
    }
}
