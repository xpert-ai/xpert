import { Command, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { ForbiddenException, Inject, NotFoundException } from '@nestjs/common'
import { AiModelTypeEnum, IWFNClassifier, KnowledgebaseTypeEnum, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { assistantModelCandidates } from '../assistant-model-selection.util'
import { AssistantPrincipalAccessService, assistantPrincipalDenied } from './assistant-principal-access.service'
import { KnowledgebaseGetOneQuery } from '../../knowledgebase/queries/get-one.query'

/** Confirms a published model binding for the Assistant principal; provider policy remains with model access. */
export class ResolveAssistantModelCommand extends Command<boolean> {
    constructor(
        readonly actor: { tenantId: string; organizationId: string; userId: string },
        readonly assistantId: string,
        readonly model: { copilotId: string; model: string; modelType: AiModelTypeEnum }
    ) {
        super()
    }
}

@CommandHandler(ResolveAssistantModelCommand)
export class ResolveAssistantModelHandler implements ICommandHandler<ResolveAssistantModelCommand> {
    constructor(
        @Inject(AssistantPrincipalAccessService)
        private readonly access: Pick<AssistantPrincipalAccessService, 'isPrincipal' | 'find'>,
        private readonly database: DataSource,
        @Inject(QueryBus) private readonly queries: Pick<QueryBus, 'execute'>
    ) {}

    async execute({ actor, assistantId, model }: ResolveAssistantModelCommand) {
        if (!(await this.access.isPrincipal(actor))) return false
        if (!(await this.access.find(actor, { assistantId }))) throw assistantPrincipalDenied()
        const retrievalModel =
            model.modelType === AiModelTypeEnum.TEXT_EMBEDDING || model.modelType === AiModelTypeEnum.RERANK
        const assistant = await this.database.getRepository(Xpert).findOne({
            where: { id: assistantId, tenantId: actor.tenantId, organizationId: actor.organizationId },
            relations: [
                'agent',
                'agent.copilotModel',
                'copilotModel',
                'agents',
                'agents.copilotModel',
                ...(retrievalModel ? ['knowledgebases'] : [])
            ]
        })
        if (!assistant?.active || !assistant.publishAt) throw assistantPrincipalDenied()
        const models = [
            ...assistantModelCandidates(assistant).map((item) => item.model),
            // Classifiers without an override use the team model, even when the primary Agent overrides it.
            assistant.copilotModel,
            ...[assistant.agent, ...(assistant.agents ?? [])].flatMap((agent) =>
                agent
                    ? [
                          agent.copilotModel,
                          ...(agent.options?.fallback?.enabled ? [agent.options.fallback.copilotModel] : [])
                      ]
                    : []
            ),
            // Only published workflow bindings grant access; draft edits and arbitrary node options do not.
            ...(assistant.graph?.nodes ?? []).flatMap((node) =>
                node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.CLASSIFIER
                    ? [(node.entity as IWFNClassifier).copilotModel]
                    : []
            )
        ].filter(Boolean)
        if (
            models.some(
                (candidate) =>
                    candidate.copilotId === model.copilotId &&
                    candidate.model === model.model &&
                    (candidate.modelType ?? AiModelTypeEnum.LLM) === model.modelType
            )
        )
            return true

        if (
            retrievalModel &&
            actor.tenantId === RequestContext.currentTenantId() &&
            actor.organizationId === RequestContext.getOrganizationId() &&
            actor.userId === RequestContext.currentUserId()
        ) {
            // Publication collects Agent attachments and workflow knowledge nodes in this relation.
            for (const binding of assistant.knowledgebases ?? []) {
                if (binding.tenantId !== actor.tenantId || binding.organizationId !== actor.organizationId) continue
                try {
                    const library = await this.queries.execute(
                        new KnowledgebaseGetOneQuery({
                            id: binding.id,
                            purpose: 'retrieval',
                            options: { relations: ['copilotModel', 'rerankModel'] }
                        })
                    )
                    if (
                        library.tenantId !== actor.tenantId ||
                        library.organizationId !== actor.organizationId ||
                        library.type === KnowledgebaseTypeEnum.External
                    )
                        continue
                    // Pending embedding rebuilds do not grant access to their replacement model.
                    const candidate =
                        model.modelType === AiModelTypeEnum.TEXT_EMBEDDING ? library.copilotModel : library.rerankModel
                    if (
                        candidate?.copilotId === model.copilotId &&
                        candidate.model === model.model &&
                        candidate.modelType === model.modelType
                    )
                        return true
                } catch (error) {
                    if (error instanceof ForbiddenException || error instanceof NotFoundException) continue
                    throw error
                }
            }
        }
        throw assistantPrincipalDenied()
    }
}
