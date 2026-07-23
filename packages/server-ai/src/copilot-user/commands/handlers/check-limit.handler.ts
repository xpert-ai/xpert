import { mapTranslationLanguage } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotOrganizationService } from '../../../copilot-organization/index'
import { MembershipService } from '../../../membership'
import { CopilotUserService } from '../../copilot-user.service'
import { CopilotCheckLimitCommand } from '../check-limit.command'
import { CopilotModelNotFoundException, ExceedingLimitException } from '../../../core/errors'

@CommandHandler(CopilotCheckLimitCommand)
export class CopilotCheckLimitHandler implements ICommandHandler<CopilotCheckLimitCommand> {
    constructor(
        private readonly copilotUserService: CopilotUserService,
        private readonly copilotOrganizationService: CopilotOrganizationService,
        private readonly membershipService: MembershipService,
        private readonly i18nService: I18nService
    ) {}

    public async execute(command: CopilotCheckLimitCommand): Promise<void> {
        const { input } = command
        const { copilot, tenantId, organizationId, userId, xpertId } = input

        if (!copilot?.modelProvider) {
            throw new CopilotModelNotFoundException(
                await this.i18nService.t('copilot.Error.AIModelNotFound', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }

            await this.membershipService.assertCanUse({
                tenantId,
                organizationId,
                copilotOrganizationId: copilot.organizationId ?? null,
                userId,
                xpertId,
                provider: copilot.modelProvider.providerName,
                model: input.model
            })

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
                    args: { model: input.model }
                })
            )
        }

        const orgUsage = await this.copilotOrganizationService.getUsageSummary({
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            provider: copilot.modelProvider.providerName,
            model: input.model
        })
        if (orgUsage.tokenLimit && orgUsage.tokenUsed >= orgUsage.tokenLimit) {
            throw new ExceedingLimitException(
                await this.i18nService.t('copilot.Error.TokenExceedsOrgLimit', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
                    args: { model: input.model }
                })
            )
        }
    }
}
