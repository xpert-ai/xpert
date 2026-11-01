import { Command } from '@nestjs/cqrs'
import type { VolumeScope } from '../../shared/volume'
import type { ConversationEnvironmentFileContext } from './conversation-environment-files.service'

/** Resolve files for an already-authorized conversation through the installed host policy. */
export class ResolveConversationEnvironmentFilesCommand extends Command<VolumeScope> {
    constructor(public readonly context: ConversationEnvironmentFileContext) {
        super()
    }
}
