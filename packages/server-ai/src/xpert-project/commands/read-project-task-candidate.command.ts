import { Command } from '@nestjs/cqrs'
import type { ProjectTaskCandidateReceipt, ProjectTaskContext } from '@xpert-ai/plugin-sdk'

/** Read the latest implementation's immutable output without accepting or refreshing the task. */
export class ReadProjectTaskCandidateCommand extends Command<ProjectTaskCandidateReceipt> {
    constructor(
        readonly context: ProjectTaskContext,
        readonly taskId: string
    ) {
        super()
    }
}
