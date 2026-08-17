import { InvalidConfigurationException } from '@xpert-ai/server-core'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { CopilotGetOneQuery } from '../../../copilot/queries'
import { CopilotUsageService } from '../../../copilot-usage'
import { ModelAccessService } from '../../../model-access'
import { CopilotModelUsageRecordCommand } from '../model-usage-record.command'

@CommandHandler(CopilotModelUsageRecordCommand)
export class CopilotModelUsageRecordHandler implements ICommandHandler<CopilotModelUsageRecordCommand> {
    constructor(
        private readonly queryBus: QueryBus,
        private readonly modelAccessService: ModelAccessService,
        private readonly copilotUsageService: CopilotUsageService
    ) {}

    async execute(command: CopilotModelUsageRecordCommand) {
        const { input } = command
        const model = input.report.model?.trim()
        if (!model) {
            throw new InvalidConfigurationException('Model usage report requires a model.')
        }

        const copilot =
            input.copilot ??
            (await this.queryBus.execute(new CopilotGetOneQuery(input.tenantId, input.copilotId, ['modelProvider'])))
        if (!copilot?.id || !copilot.modelProvider?.providerName) {
            throw new InvalidConfigurationException('Model usage report requires a configured Copilot provider.')
        }

        const modelAccess =
            input.modelAccess ??
            (await this.modelAccessService.assertCanUseModel({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                userId: input.userId,
                xpertId: input.xpertId,
                copilotId: copilot.id,
                copilotModelId: model,
                modelType: input.report.modelType
            }))

        return this.copilotUsageService.recordModelUsage(
            {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                copilotOrganizationId: copilot.organizationId ?? null,
                userId: modelAccess.billableUserId,
                originType: input.originExecutionId ? 'execution' : 'model',
                originId: input.originId,
                originExecutionId: input.originExecutionId,
                xpertId: input.xpertId,
                copilotId: copilot.id,
                providerScopeId: copilot.modelProvider.id ?? copilot.id,
                provider: copilot.modelProvider.providerName,
                modelAccess
            },
            { ...input.report, model },
            input.pricingSnapshot
        )
    }
}
