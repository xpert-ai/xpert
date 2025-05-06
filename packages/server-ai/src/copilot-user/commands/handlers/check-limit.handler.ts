import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IsNull } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import { CopilotOrganizationService } from '../../../copilot-organization/index'
import { CopilotUserService } from '../../copilot-user.service'
import { CopilotCheckLimitCommand } from '../check-limit.command'
import { ExceedingLimitException } from '../../../core/errors'
import { RequestContext } from '@metad/server-core'
import { mapTranslationLanguage } from '@metad/contracts'

@CommandHandler(CopilotCheckLimitCommand)
export class CopilotCheckLimitHandler implements ICommandHandler<CopilotCheckLimitCommand> {
	constructor(
		private readonly copilotUserService: CopilotUserService,
		private readonly copilotOrganizationService: CopilotOrganizationService,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CopilotCheckLimitCommand): Promise<void> {
		const { input } = command
		const { copilot, tenantId, organizationId, userId } = input

		const existing = await this.copilotUserService.findOneOrFail({
			where: {
				tenantId,
				organizationId,
				orgId: copilot.organizationId ?? IsNull(),
				userId,
				provider: copilot.modelProvider.providerName,
				model: input.model
			}
		})

		if (existing.success) {
			if (existing.record.tokenLimit && existing.record.tokenUsed >= existing.record.tokenLimit) {
				throw new ExceedingLimitException(
					await this.i18nService.t('copilot.Error.TokenExceedsLimit', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				)
			}
		}

		const orgExisting = await this.copilotOrganizationService.findOneOrFail({
			where: {
				tenantId: input.tenantId,
				organizationId: input.organizationId,
				provider: copilot.modelProvider.providerName,
				model: input.model
			}
		})
		if (orgExisting.success) {
			if (orgExisting.record.tokenLimit && orgExisting.record.tokenUsed >= orgExisting.record.tokenLimit) {
				throw new ExceedingLimitException(
					await this.i18nService.t('copilot.Error.TokenExceedsOrgLimit', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				)
			}
		}
	}
}
