import { ICopilotCheckpoint } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { FindOptionsWhere } from 'typeorm'

export class CheckpointDeleteCommand implements ICommand {
	static readonly type = '[Checkpoint] Delete'

	constructor(public readonly conditions: FindOptionsWhere<ICopilotCheckpoint>) {}
}
