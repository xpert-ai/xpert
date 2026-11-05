import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { AssistantRuntimeCredential } from '@xpert-ai/server-core'
import { FindOneOptions, Repository } from 'typeorm'
import { applyAssistantRuntimeCredential } from '../../xpert/assistant-runtime-compatibility'
import { Xpert } from '../../xpert/xpert.entity'
import { knowledgebaseAccessDenied } from '../access/knowledgebase-access-policy'
import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { appPlatformKnowledgeIds } from '../runtime/app-platform-knowledge-access'
import { KnowledgeResourceAccessService } from '../runtime/knowledge-resource-access.service'

type SearchScope = { tenantId?: string; organizationId?: string; xpertId?: string }

@Injectable()
export class AssistantKnowledgeRetrievalService {
    constructor(
        @InjectRepository(Knowledgebase) private readonly libraries: Repository<Knowledgebase>,
        private readonly resources: KnowledgeResourceAccessService
    ) {}

    async findBound(
        credential: AssistantRuntimeCredential,
        ids: string[],
        scope: SearchScope,
        options?: Pick<FindOneOptions<Knowledgebase>, 'select' | 'relations'>
    ): Promise<Knowledgebase[]> {
        if (
            credential.allowed === false ||
            !ids?.length ||
            credential.tenantId !== RequestContext.currentTenantId() ||
            (scope.tenantId != null && scope.tenantId !== credential.tenantId) ||
            (scope.xpertId != null && scope.xpertId !== credential.assistantId)
        ) {
            throw knowledgebaseAccessDenied()
        }

        // Publication records both agent attachments and workflow retrieval nodes in xpert.knowledgebases.
        const binding = applyAssistantRuntimeCredential(
            this.libraries.manager.createQueryBuilder(Xpert, 'xpert'),
            credential
        )
            .innerJoin('xpert.knowledgebases', 'bound')
            .select('bound.id')
            .andWhere('bound."workspaceId" = xpert."workspaceId"')
            .andWhere('bound."tenantId" = xpert."tenantId"')
            .andWhere('bound."organizationId" IS NOT DISTINCT FROM xpert."organizationId"')
        if (scope.organizationId != null) {
            binding.andWhere('xpert."organizationId" = :retrievalOrganization', {
                retrievalOrganization: scope.organizationId
            })
        }
        const requested = [...new Set(ids)]
        const rows = await this.libraries
            .createQueryBuilder('kb')
            .setFindOptions({ select: options?.select, relations: options?.relations })
            .addSelect(['kb.id', 'kb.resourceRef'])
            .where('kb.id IN (:...requested)', { requested })
            .andWhere(`kb.id IN (${binding.getQuery()})`, binding.getParameters())
            .getMany()

        if (rows.length !== requested.length) throw knowledgebaseAccessDenied()
        const managed = await appPlatformKnowledgeIds(this.libraries.manager)
        for (const row of rows) {
            if (row.resourceRef) await this.resources.authorizeReference(row.resourceRef, 'read')
            else if (managed && !managed.includes(row.id)) throw knowledgebaseAccessDenied()
        }
        return rows
    }
}
