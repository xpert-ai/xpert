import { Command } from '@nestjs/cqrs'
import type { RuntimeCapabilityXpert } from './runtime-capabilities.helpers'
import type { RuntimeCapabilitiesService } from './runtime-capabilities.service'

/** Resolve capabilities for a server-authorized Assistant configuration; callers retain their access and draft checks. */
export class GetRuntimeCapabilitiesCommand extends Command<
    Awaited<ReturnType<RuntimeCapabilitiesService['getRuntimeCapabilities']>>
> {
    constructor(
        public readonly xpert: RuntimeCapabilityXpert,
        public readonly assistantId?: string,
        public readonly projectId?: string
    ) {
        super()
    }
}
