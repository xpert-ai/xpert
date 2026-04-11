import { IListQueryInput, IPermissionApprovalFindInput } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class PermissionApprovalPolicyGetCommand implements ICommand {
	static readonly type = '[PermissionApprovalPolicy] Get';

	constructor(
		public readonly input: IListQueryInput<IPermissionApprovalFindInput>
	) {}
}
