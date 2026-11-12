import { ForbiddenException, Inject, NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AiModelTypeEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, IsNull, Not } from 'typeorm'
import { KnowledgebaseService } from '../../management/knowledgebase.service'
import { Knowledgebase } from '../../persistence/knowledgebase.entity'
import { ResolveAssistantKnowledgeModelQuery } from '../resolve-assistant-knowledge-model.query'

@QueryHandler(ResolveAssistantKnowledgeModelQuery)
export class ResolveAssistantKnowledgeModelHandler implements IQueryHandler<ResolveAssistantKnowledgeModelQuery> {
    constructor(
        private readonly database: DataSource,
        @Inject(KnowledgebaseService)
        private readonly libraries: Pick<KnowledgebaseService, 'findOneForSearch'>
    ) {}

    async execute({ actor, assistantId, model }: ResolveAssistantKnowledgeModelQuery): Promise<boolean> {
        if (
            !actor.tenantId ||
            !actor.organizationId ||
            !actor.userId ||
            actor.tenantId !== RequestContext.currentTenantId() ||
            actor.organizationId !== RequestContext.getOrganizationId() ||
            actor.userId !== RequestContext.currentUserId() ||
            (model.modelType !== AiModelTypeEnum.TEXT_EMBEDDING && model.modelType !== AiModelTypeEnum.RERANK)
        )
            return false

        // Publication collects both Agent attachments and workflow knowledge nodes in this relation.
        // Only the active embedding model is a retrieval dependency; pending rebuilds grant nothing.
        const bound = await this.database.getRepository(Knowledgebase).find({
            where: {
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                xperts: {
                    id: assistantId,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    userId: actor.userId,
                    active: true,
                    publishAt: Not(IsNull())
                }
            },
            select: { id: true }
        })
        for (const { id } of bound) {
            let library: Knowledgebase
            try {
                library = await this.libraries.findOneForSearch(
                    id,
                    { relations: ['copilotModel', 'rerankModel'] },
                    { xpertId: assistantId }
                )
            } catch (error) {
                if (error instanceof ForbiddenException || error instanceof NotFoundException) continue
                throw error
            }
            if (
                library.tenantId !== actor.tenantId ||
                library.organizationId !== actor.organizationId ||
                library.type === KnowledgebaseTypeEnum.External
            )
                continue
            const candidate =
                model.modelType === AiModelTypeEnum.TEXT_EMBEDDING ? library.copilotModel : library.rerankModel
            if (
                candidate?.copilotId === model.copilotId &&
                candidate.model === model.model &&
                candidate.modelType === model.modelType
            )
                return true
        }
        return false
    }
}
