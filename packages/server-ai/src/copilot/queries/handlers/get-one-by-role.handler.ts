import { AiModelTypeEnum, AiProviderRole, ICopilot } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotService } from '../../copilot.service'
import { CopilotWithProviderDto } from '../../dto'
import { FindCopilotModelsQuery } from '../copilot-model-find.query'
import { CopilotOneByRoleQuery } from '../get-one-by-role.query'

@QueryHandler(CopilotOneByRoleQuery)
export class CopilotOneByRoleHandler implements IQueryHandler<CopilotOneByRoleQuery> {
    constructor(
        private readonly service: CopilotService,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: CopilotOneByRoleQuery): Promise<ICopilot> {
        const items = await this.service.findAllAvailablesCopilots(
            command.tenantId,
            command.organizationId,
            {
                role: command.role
            },
            command.relations
        )
        if (items.length) {
            return items[0]
        }

        // Role lookup must honor the same model grants as the governed catalog.
        // Its request-scoped query cannot be used for a different background scope.
        if (
            !RequestContext.currentUserId() ||
            RequestContext.currentTenantId() !== command.tenantId ||
            (RequestContext.getOrganizationId() ?? null) !== (command.organizationId ?? null)
        ) {
            return null
        }
        const modelType =
            command.role === AiProviderRole.Embedding ? AiModelTypeEnum.TEXT_EMBEDDING : AiModelTypeEnum.LLM
        const catalog = await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
            new FindCopilotModelsQuery(modelType)
        )
        const candidates = await this.service.findAllEnabledCopilotsWithoutMembership(
            command.tenantId,
            command.organizationId,
            { role: command.role },
            command.relations
        )
        return (
            candidates.find((copilot) =>
                catalog.some(
                    (entry) =>
                        entry.id === copilot.id &&
                        entry.providerWithModels.models.some((model) => model.model === copilot.copilotModel?.model)
                )
            ) ?? null
        )
    }
}
