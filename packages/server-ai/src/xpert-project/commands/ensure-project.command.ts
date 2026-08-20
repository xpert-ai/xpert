import type { ProjectEnsureInput, ProjectEnsureResult } from '@xpert-ai/plugin-sdk'
import { Command } from '@nestjs/cqrs'

/** Idempotently reconciles a plugin-owned business Project with a Chat Project. */
export class EnsureXpertProjectCommand extends Command<ProjectEnsureResult> {
    static readonly type = '[Xpert Project] Ensure managed project'

    constructor(
        /** Caller-supplied stable id and desired Project/Assistant state. */
        public readonly input: ProjectEnsureInput
    ) {
        super()
    }
}
