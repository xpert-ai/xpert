import { Command } from '@nestjs/cqrs'
import type { XpertDataVolumeScope, resolveXpertDataVolumeScope } from '../../shared/volume/volume'

/** Resolve storage ownership from trusted actor identity; callers still authorize the Assistant and operation. */
export class ResolveAssistantWorkspaceScopeCommand extends Command<XpertDataVolumeScope> {
    constructor(readonly input: Parameters<typeof resolveXpertDataVolumeScope>[0]) {
        super()
    }
}
