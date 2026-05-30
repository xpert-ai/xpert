import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CopilotCheckpointRetentionDryRunCommand, CopilotCheckpointRetentionExecuteCommand } from '../retention.command'
import {
    CopilotCheckpointRetentionDryRunResult,
    CopilotCheckpointRetentionExecuteResult,
    CopilotCheckpointRetentionService
} from '../../retention.service'

@CommandHandler(CopilotCheckpointRetentionDryRunCommand)
export class CopilotCheckpointRetentionDryRunHandler implements ICommandHandler<CopilotCheckpointRetentionDryRunCommand> {
    constructor(private readonly service: CopilotCheckpointRetentionService) {}

    public async execute(
        command: CopilotCheckpointRetentionDryRunCommand
    ): Promise<CopilotCheckpointRetentionDryRunResult> {
        return this.service.dryRun(command.options)
    }
}

@CommandHandler(CopilotCheckpointRetentionExecuteCommand)
export class CopilotCheckpointRetentionExecuteHandler implements ICommandHandler<CopilotCheckpointRetentionExecuteCommand> {
    constructor(private readonly service: CopilotCheckpointRetentionService) {}

    public async execute(
        command: CopilotCheckpointRetentionExecuteCommand
    ): Promise<CopilotCheckpointRetentionExecuteResult> {
        return this.service.execute(command.options)
    }
}
