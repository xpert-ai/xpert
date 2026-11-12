import { Command } from '@nestjs/cqrs'
import type { ProjectTaskAcceptanceReceipt, ProjectTaskContext } from '@xpert-ai/plugin-sdk'

/** Read current accepted task evidence. Does not dispatch work or decide business acceptance. */
export class ReadProjectTaskAcceptanceCommand extends Command<ProjectTaskAcceptanceReceipt | null> {
    constructor(readonly context: ProjectTaskContext, readonly taskId: string) { super() }
}
