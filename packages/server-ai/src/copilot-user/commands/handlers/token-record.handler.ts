import { mapTranslationLanguage, USAGE_HOUR_FORMAT } from '@metad/contracts'
import { InvalidConfigurationException, RequestContext } from '@metad/server-core'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotOrganizationService } from '../../../copilot-organization/index'
import { CopilotGetOneQuery } from '../../../copilot/queries'
import { ExceedingLimitException } from '../../../core/errors'
import { formatInUTC0 } from '../../../shared/utils'
import { CopilotUserService } from '../../copilot-user.service'
import { CopilotTokenRecordCommand } from '../token-record.command'

@CommandHandler(CopilotTokenRecordCommand)
export class CopilotTokenRecordHandler implements ICommandHandler<CopilotTokenRecordCommand> {
	constructor(
		private readonly queryBus: QueryBus,
		private readonly copilotUserService: CopilotUserService,
		private readonly copilotOrganizationService: CopilotOrganizationService,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CopilotTokenRecordCommand): Promise<void> {
		const { input } = command
		const { organizationId, userId, model, tokenUsed, xpertId, threadId } = input
		const copilotId = input.copilotId ?? input.copilot?.id

		if (!model) {
			throw new InvalidConfigurationException(
				await this.i18nService.t('copilot.Error.TokenNoModel', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}

		if (tokenUsed > 0) {
			const usageHour = formatInUTC0(new Date(), USAGE_HOUR_FORMAT)
			const copilot = await this.queryBus.execute(
				new CopilotGetOneQuery(input.tenantId, copilotId, ['modelProvider'])
			)
			// Record the token used by the organization or globally for the user
			const record = await this.copilotUserService.upsert({
				copilotId,
				organizationId,
				userId,
				xpertId,
				threadId,
				orgId: copilot.organizationId,
				provider: copilot.modelProvider.providerName,
				model,
				usageHour,
				tokenLimit: copilot.tokenBalance,
				tokenUsed,
				priceUsed: input.priceUsed,
				currency: input.currency
			})

			if (record.tokenLimit && record.tokenUsed >= record.tokenLimit) {
				throw new ExceedingLimitException(
					await this.i18nService.t('copilot.Error.TokenExceedsLimit', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				)
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
					throw new ExceedingLimitException(
						await this.i18nService.t('copilot.Error.TokenExceedsOrgLimit', {
							lang: mapTranslationLanguage(RequestContext.getLanguageCode())
						})
					)
				}
			}
		}
	}
}
