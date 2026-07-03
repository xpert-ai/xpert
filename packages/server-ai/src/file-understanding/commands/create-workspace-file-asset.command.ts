import { Command } from '@nestjs/cqrs'
import type { WorkspaceUnderstandFileInput } from '@xpert-ai/plugin-sdk'
import { FileAsset } from '../entities'

export class CreateWorkspaceFileAssetCommand extends Command<FileAsset> {
    static readonly type = '[File Understanding] Create workspace file asset'

    constructor(public readonly input: WorkspaceUnderstandFileInput) {
        super()
    }
}
