import { ISemanticModel } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

/**
 * Get all dimension members for hierarchies
 */
export class GetDimensionMembersCommand implements ICommand {
	static readonly type = '[Dimension Member] Get sync members';

	constructor(
		public readonly model: ISemanticModel, 
		public readonly cube: string, 
		public readonly hierarchies: string[],
		public readonly entityId: string,
	) {}
}
