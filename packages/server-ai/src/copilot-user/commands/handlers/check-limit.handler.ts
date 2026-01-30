import { mapTranslationLanguage } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotOrganizationService } from '../../../copilot-organization/index'
import { CopilotUserService } from '../../copilot-user.service'
import { CopilotCheckLimitCommand } from '../check-limit.command'
import { ExceedingLimitException } from '../../../core/errors'

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

		const usage = await this.copilotUserService.getUsageSummary({
			tenantId,
			organizationId,
			orgId: copilot.organizationId ?? null,
			userId,
			provider: copilot.modelProvider.providerName,
			model: input.model
		})

		if (usage.tokenLimit && usage.tokenUsed >= usage.tokenLimit) {
			throw new ExceedingLimitException(
				await this.i18nService.t('copilot.Error.TokenExceedsLimit', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {model: input.model}
				})
			)
		}

		const orgExisting = await this.copilotOrganizationService.findOneOrFailByOptions({
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
						lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
						args: {model: input.model}
					})
				)
			}
		}
	}
}
