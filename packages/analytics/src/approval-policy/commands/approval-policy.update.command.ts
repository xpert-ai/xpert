import { IApprovalPolicy, IApprovalPolicyUpdateInput } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class ApprovalPolicyUpdateCommand implements ICommand {
	static readonly type = '[ApprovalPolicy] Update';

	constructor(
		public readonly id: IApprovalPolicy['id'],
		public readonly input: IApprovalPolicyUpdateInput
	) {}
}