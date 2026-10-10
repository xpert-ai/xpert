import { Command } from '@nestjs/cqrs'
import type { IXpert } from '@xpert-ai/contracts'
import type { RuntimeCapabilitiesService } from './runtime-capabilities.service'

/** Resolve capabilities for a server-authorized Assistant configuration; callers retain their access and draft checks. */
export class GetRuntimeCapabilitiesCommand extends Command<
    Awaited<ReturnType<RuntimeCapabilitiesService['getRuntimeCapabilities']>>
> {
    constructor(
        public readonly xpert: IXpert,
        public readonly assistantId?: string,
        public readonly projectId?: string
    ) {
        super()
    }
}
