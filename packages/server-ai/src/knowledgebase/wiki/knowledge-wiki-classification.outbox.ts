// Publication and taxonomy completion insert jobs in their transaction so pending pages survive restarts.
import type { KnowledgeWikiPageClassificationInput } from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { v5 as uuidv5 } from 'uuid'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob } from './entities'
import {
    createKnowledgeWikiConfigFingerprint,
    KNOWLEDGE_WIKI_GENERATOR_VERSION,
    resolveKnowledgeWikiModel
} from './knowledge-wiki-config'

export async function enqueueWikiPageClassification(
    manager: EntityManager,
    kb: Knowledgebase,
    input: KnowledgeWikiPageClassificationInput,
    userId: string
) {
    const key = `classify:${input.pageId}:${input.pageVersionId}:${input.taxonomyRevision}:${input.placementVersion}:${input.trigger === 'publication' ? 'auto' : input.runId}`
    const id = uuidv5(`${kb.id}:${key}`, uuidv5.URL)
    await manager
        .getRepository(KnowledgeWikiJob)
        .createQueryBuilder()
        .insert()
        .values({
            id,
            tenantId: kb.tenantId,
            organizationId: kb.organizationId,
            knowledgebaseId: kb.id,
            type: 'classify',
            jobKey: key,
            isCurrent: true,
            status: 'queued',
            generationRevision: kb.wikiActiveRevision ?? 0,
            generationAttempt: 0,
            executionAttempt: 0,
            billingPrincipalId: userId,
            configFingerprint: createKnowledgeWikiConfigFingerprint(kb.wikiConfig, resolveKnowledgeWikiModel(kb)),
            generatorVersion: KNOWLEDGE_WIKI_GENERATOR_VERSION,
            dispatchAfter: new Date(),
            dispatchAttempts: 0,
            spendEnvelope: { maxModelInvocations: 2, maxEstimatedTokens: 100000 },
            classification: input
        })
        .orIgnore()
        .execute()
}
