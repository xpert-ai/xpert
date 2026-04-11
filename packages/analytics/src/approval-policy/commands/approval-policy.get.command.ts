import { PaginationParams } from '@xpert-ai/server-core';
import { ICommand } from '@nestjs/cqrs';
import { ApprovalPolicy } from '../approval-policy.entity';

export class ApprovalPolicyGetCommand implements ICommand {
	static readonly type = '[Approval Policy] Get';

	constructor(
		public readonly input: PaginationParams<ApprovalPolicy>
	) {}
}
