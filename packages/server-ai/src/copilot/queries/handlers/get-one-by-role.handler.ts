import { defaultModelDefinition, ICopilot, isProviderModelEnabled } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotRoleDefaultService } from '../../role-defaults/role-default.service'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotService } from '../../copilot.service'
import { CopilotWithProviderDto } from '../../dto'
import { FindCopilotModelsQuery } from '../copilot-model-find.query'
import { ResolveDefaultModelQuery } from '../resolve-default-model.query'

@QueryHandler(ResolveDefaultModelQuery)
export class CopilotOneByRoleHandler implements IQueryHandler<ResolveDefaultModelQuery> {
    constructor(
        private readonly service: CopilotService,
        private readonly queryBus: QueryBus,
        private readonly roleDefaults: CopilotRoleDefaultService
    ) {}

    public async execute(command: ResolveDefaultModelQuery): Promise<ICopilot> {
        const definition = defaultModelDefinition(command.role)
        const resolved = await this.roleDefaults.resolve(command.tenantId, command.organizationId ?? null, command.role)
        const binding = resolved.binding
        if (!binding || binding.modelType !== definition.modelType) return null
        const candidates = await this.service.findAllEnabledCopilotsWithoutMembership(
            command.tenantId,
            command.organizationId,
            { id: binding.copilotId },
            command.relations
        )
        const connection = candidates.find((item) => item.id === binding.copilotId)
        if (
            !connection?.modelProvider ||
            connection.modelProvider.isValid === false ||
            !isProviderModelEnabled(connection.modelProvider, { model: binding.model, modelType: binding.modelType })
        )
            return null
        if (RequestContext.currentUserId()) {
            if (
                RequestContext.currentTenantId() !== command.tenantId ||
                (RequestContext.getOrganizationId() ?? null) !== (command.organizationId ?? null)
            )
                return null
            const catalog = await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
                new FindCopilotModelsQuery(binding.modelType)
            )
            if (
                !catalog.some(
                    (item) =>
                        item.id === binding.copilotId &&
                        item.providerWithModels.models.some(
                            (model) => model.model === binding.model && model.model_type === binding.modelType
                        )
                )
            )
                return null
        }
        return { ...connection, copilotModel: { ...binding } }
    }
}
