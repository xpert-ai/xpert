import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { AssistantRuntimeCredential } from '@xpert-ai/server-core'
import { FindOneOptions, Repository } from 'typeorm'
import { applyAssistantRuntimeCredential } from '../../xpert/assistant-runtime-compatibility'
import { GetAccessiblePublishedXpertQuery } from '../../xpert/published-agent/get-accessible-published-xpert.query'
import { publishedAgentDelegation } from '../../xpert/published-agent/with-published-agent'
import { Xpert } from '../../xpert/xpert.entity'
import {
    knowledgebaseAccessDenied,
    ORGANIZATION_SHARED_LIBRARY_PERMISSIONS
} from '../access/knowledgebase-access-policy'
import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { appPlatformKnowledgeIds } from '../runtime/app-platform-knowledge-access'
import { KnowledgeResourceAccessService } from '../runtime/knowledge-resource-access.service'

type SearchScope = { tenantId?: string; organizationId?: string; xpertId?: string }

@Injectable()
export class AssistantKnowledgeRetrievalService {
    constructor(
        @InjectRepository(Knowledgebase) private readonly libraries: Repository<Knowledgebase>,
        private readonly resources: KnowledgeResourceAccessService,
        private readonly queries: QueryBus
    ) {}

    async findBound(
        credential: AssistantRuntimeCredential,
        ids: string[],
        scope: SearchScope,
        options?: Pick<FindOneOptions<Knowledgebase>, 'select' | 'relations'>
    ): Promise<Knowledgebase[]> {
        const delegation = publishedAgentDelegation()
        if (
            credential.allowed === false ||
            !ids?.length ||
            credential.tenantId !== RequestContext.currentTenantId() ||
            (scope.tenantId != null && scope.tenantId !== credential.tenantId) ||
            (delegation && delegation.requesterXpertId !== credential.assistantId)
        ) {
            throw knowledgebaseAccessDenied()
        }

        const targetId = delegation?.xpertId ?? credential.assistantId
        if (scope.xpertId != null && scope.xpertId !== targetId) throw knowledgebaseAccessDenied()

        // Publication records both agent attachments and workflow retrieval nodes in xpert.knowledgebases.
        const binding = applyAssistantRuntimeCredential(
            this.libraries.manager.createQueryBuilder(Xpert, 'xpert'),
            credential
        )
        let owner = 'xpert'
        if (targetId !== credential.assistantId) {
            // Only the server's delegation can select a child. Recheck its live resource access on every read.
            const target = await this.queries.execute(new GetAccessiblePublishedXpertQuery(targetId))
            owner = 'target'
            binding.innerJoin(
                Xpert,
                owner,
                `target.id = :targetId AND target."publishAt" IS NOT NULL
                AND target."workspaceId" IS NOT DISTINCT FROM :targetWorkspaceId
                AND target."tenantId" = xpert."tenantId"
                AND target."organizationId" IS NOT DISTINCT FROM xpert."organizationId"`,
                { targetId: target.id, targetWorkspaceId: target.workspaceId ?? null }
            )
        }
        binding
            .innerJoin(`${owner}.knowledgebases`, 'bound')
            .select('bound.id')
            .andWhere(
                `(bound."workspaceId" = ${owner}."workspaceId" OR
                (bound."workspaceId" IS NOT NULL AND bound."organizationId" IS NOT NULL
                 AND bound.permission IN (:...sharedPermissions)))`,
                {
                    sharedPermissions: ORGANIZATION_SHARED_LIBRARY_PERMISSIONS
                }
            )
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
