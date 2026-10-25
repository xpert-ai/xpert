import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { t } from 'i18next'
import { XpertService } from '../../xpert.service'
import { GetXpertRecoveryDefinitionQuery, XpertRecoveryDefinition } from '../get-xpert-recovery-definition.query'

@QueryHandler(GetXpertRecoveryDefinitionQuery)
export class GetXpertRecoveryDefinitionHandler implements IQueryHandler<GetXpertRecoveryDefinitionQuery> {
    constructor(private readonly service: XpertService) {}

    async execute({ id }: GetXpertRecoveryDefinitionQuery): Promise<XpertRecoveryDefinition> {
        // Keep all threadGraphRevision inputs, but never join collection relations onto the large graph JSON.
        const xpert = await this.service.findOneForRuntime(id, {
            select: {
                id: true,
                tenantId: true,
                organizationId: true,
                workspaceId: true,
                graph: true,
                type: true,
                agentConfig: true,
                memory: true,
                summarize: true,
                features: true,
                commandProfile: true,
                options: true,
                environmentId: true,
                workspaceDataScope: true,
                agent: { id: true, key: true },
                copilotModel: { id: true, copilotId: true, modelType: true, model: true, options: true }
            },
            relations: ['agent', 'copilotModel'],
            loadEagerRelations: false
        })
        if (!xpert.graph) {
            throw new Error(t('server-ai:Error.NoGraph', { defaultValue: 'Graph not found' }))
        }
        // Workflow loading supplies a team only when the primary agent exists; legacy hashes retain that behavior.
        return { graph: xpert.graph, team: xpert.agent ? xpert : undefined }
    }
}
