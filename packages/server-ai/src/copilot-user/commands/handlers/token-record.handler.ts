import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { CopilotOrganizationService } from '../../../copilot-organization/index'
import { CopilotUserService } from '../../copilot-user.service'
import { CopilotTokenRecordCommand } from '../token-record.command'
import { CopilotGetOneQuery } from '../../../copilot/queries'
import { ExceedingLimitException } from '../../../core/errors'

@CommandHandler(CopilotTokenRecordCommand)
export class CopilotTokenRecordHandler implements ICommandHandler<CopilotTokenRecordCommand> {
	constructor(
		private readonly queryBus: QueryBus,
		private readonly copilotUserService: CopilotUserService,
		private readonly copilotOrganizationService: CopilotOrganizationService
	) {}

	public async execute(command: CopilotTokenRecordCommand): Promise<void> {
		const { input } = command
		const { organizationId, userId, model, tokenUsed } = input
		const copilotId = input.copilotId ?? input.copilot?.id

		if (tokenUsed > 0) {
			const copilot = await this.queryBus.execute(new CopilotGetOneQuery(input.tenantId, copilotId, ['modelProvider']))
			// Record the token used by the organization or globally for the user
			const record = await this.copilotUserService.upsert({
				copilotId,
				organizationId,
				userId,
				orgId: copilot.organizationId,
				provider: copilot.modelProvider.providerName,
				model,
				tokenLimit: copilot.tokenBalance,
				tokenUsed,
				priceUsed: input.priceUsed,
				currency: input.currency
			})

			if (record.tokenLimit && record.tokenUsed >= record.tokenLimit) {
				throw new ExceedingLimitException('Token usage exceeds limit')
			}

			// Record the token usage of the user's organization when using the global Copilot
			if (!copilot.organizationId) {
				const orgRecord = await this.copilotOrganizationService.upsert({
					tenantId: input.tenantId,
					tokenUsed: input.tokenUsed,
					organizationId,
					copilotId,
					provider: copilot.modelProvider.providerName,
					model,
					tokenLimit: copilot.tokenBalance,
					priceUsed: input.priceUsed,
					currency: input.currency
				})

				if (orgRecord.tokenLimit && orgRecord.tokenUsed >= orgRecord.tokenLimit) {
					throw new ExceedingLimitException('Token usage of org exceeds limit')
				}
			}
		}
	}
}
