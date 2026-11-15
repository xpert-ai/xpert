import { Command } from '@nestjs/cqrs'
import type { ProjectSkillContextReceipt } from '../services/project-skill-context'

/** Prepare current Project skills for an already authorized execution. No Workspace skill import. */
export class PrepareProjectSkillContextCommand extends Command<ProjectSkillContextReceipt> {
    constructor(
        readonly projectId: string,
        readonly invocationId: string
    ) {
        super()
    }
}
