import { ICopilotCheckpoint } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

export class CheckpointDeleteCommand implements ICommand {
	static readonly type = '[Checkpoint] Delete'

	constructor(public readonly conditions: FindConditions<ICopilotCheckpoint>) {}
}
