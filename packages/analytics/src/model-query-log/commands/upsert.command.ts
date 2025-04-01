import { ISemanticModelQueryLog } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Update or insert query log for semantic model
 */
export class ModelQueryLogUpsertCommand implements ICommand {
	static readonly type = '[Model Query Log] Upsert'

	constructor(public readonly entity: Partial<ISemanticModelQueryLog>) {}
}
