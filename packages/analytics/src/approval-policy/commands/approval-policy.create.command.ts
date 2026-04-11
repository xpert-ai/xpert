import { IApprovalPolicyCreateInput } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class ApprovalPolicyCreateCommand implements ICommand {
	static readonly type = '[ApprovalPolicy] Create';

	constructor(
		public readonly input: IApprovalPolicyCreateInput
	) {}
}
