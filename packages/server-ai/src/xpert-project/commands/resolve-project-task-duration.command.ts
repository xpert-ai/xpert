import { Command } from '@nestjs/cqrs'
import type { ProjectTaskDurationConfiguration } from '@xpert-ai/contracts'
import type { ProjectAccessActor } from '@xpert-ai/plugin-sdk'

/** Platform-internal operation; the runner supplies the persisted invocation scope. */
export class ResolveProjectTaskDurationCommand extends Command<ProjectTaskDurationConfiguration> {
    constructor(readonly projectId: string, readonly actor: ProjectAccessActor) { super() }
}
