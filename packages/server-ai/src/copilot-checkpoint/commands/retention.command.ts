import { ICommand } from '@nestjs/cqrs'
import { CopilotCheckpointRetentionOptions } from '../retention.service'

export class CopilotCheckpointRetentionDryRunCommand implements ICommand {
    static readonly type = '[Copilot Checkpoint] Retention Dry Run'

    constructor(public readonly options: Partial<CopilotCheckpointRetentionOptions> = {}) {}
}

export class CopilotCheckpointRetentionExecuteCommand implements ICommand {
    static readonly type = '[Copilot Checkpoint] Retention Execute'

    constructor(public readonly options: Partial<CopilotCheckpointRetentionOptions> = {}) {}
}
