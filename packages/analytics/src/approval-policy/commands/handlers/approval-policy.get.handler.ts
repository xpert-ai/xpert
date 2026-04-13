import { IApprovalPolicy, IPagination } from '@xpert-ai/contracts';
import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApprovalPolicyService } from '../../approval-policy.service';
import { ApprovalPolicyGetCommand } from '../approval-policy.get.command';
import { ApprovalPolicy } from '../../approval-policy.entity';

@CommandHandler(ApprovalPolicyGetCommand)
export class ApprovalPolicyGetHandler
	implements ICommandHandler<ApprovalPolicyGetCommand> {
	constructor(
		private readonly approvalPolicyService: ApprovalPolicyService
	) {}

	public async execute(
		command: ApprovalPolicyGetCommand
	): Promise<IPagination<ApprovalPolicy>> {
		try {
			const { input } = command;
			return await this.approvalPolicyService.findAllApprovalPolicies(input);
		} catch (error) {
			throw new BadRequestException();
		}
	}
}
