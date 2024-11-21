import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { CopilotOrganizationService } from '../../../copilot-organization/index'
import { CopilotUserService } from '../../copilot-user.service'
import { CopilotTokenRecordCommand } from '../token-record.command'
import { CopilotGetOneQuery } from '../../../copilot/queries'

@CommandHandler(CopilotTokenRecordCommand)
export class CopilotTokenRecordHandler implements ICommandHandler<CopilotTokenRecordCommand> {
	constructor(
		private readonly queryBus: QueryBus,
		private readonly copilotUserService: CopilotUserService,
		private readonly copilotOrganizationService: CopilotOrganizationService
	) {}

	public async execute(command: CopilotTokenRecordCommand): Promise<void> {
		const { input } = command
		const { copilotId, organizationId, tokenUsed } = input

		if (tokenUsed > 0) {
			const copilot = await this.queryBus.execute(new CopilotGetOneQuery(input.tenantId, copilotId ?? input.copilot?.id, ['modelProvider']))
			// 记录该用户所使用组织或全局的 token
			const record = await this.copilotUserService.upsert({
				...input,
				organizationId,
				orgId: copilot.organizationId,
				provider: copilot.modelProvider.providerName,
				tokenLimit: copilot.tokenBalance
			})

			if (record.tokenLimit && record.tokenUsed >= record.tokenLimit) {
				throw new Error('Token usage exceeds limit')
			}

			// 使用全局 Copilot 时记录该用户所在组织的 token 使用
			if (!copilot.organizationId) {
				const orgRecord = await this.copilotOrganizationService.upsert({
					tenantId: input.tenantId,
					tokenUsed: input.tokenUsed,
					organizationId,
					provider: copilot.modelProvider.providerName,
					tokenLimit: copilot.tokenBalance
				})

				if (orgRecord.tokenLimit && orgRecord.tokenUsed >= orgRecord.tokenLimit) {
					throw new Error('Token usage of org exceeds limit')
				}
			}
		}
	}
}
