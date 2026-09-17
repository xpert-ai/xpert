import type { KnowledgeGraphCatalog, KnowledgeGraphVisualizationQuery } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import { KnowledgeGraphEntity, KnowledgeGraphRelation } from './entities'
import { buildGraphView } from './graph-explorer-model'

/** Source membership is checked on both entities and relations: shared materials must not leak other BOMs. */
export async function readGraphScope(
    repository: Repository<KnowledgeGraphEntity>,
    knowledgebaseId: string,
    query: KnowledgeGraphVisualizationQuery = {}
) {
    const entityQuery = repository
        .createQueryBuilder('entity')
        .where('entity.knowledgebaseId = :knowledgebaseId', { knowledgebaseId })
    const relationQuery = repository.manager
        .getRepository(KnowledgeGraphRelation)
        .createQueryBuilder('relation')
        .where('relation.knowledgebaseId = :knowledgebaseId', { knowledgebaseId })
    for (const [builder, alias] of [
        [entityQuery, 'entity'],
        [relationQuery, 'relation']
    ] as const) {
        if (!query.includeHidden)
            builder.andWhere(`COALESCE(${alias}.visibility, 'active') = :visibility`, {
                visibility: query.visibility ?? 'active'
            })
        if (query.origin) builder.andWhere(`COALESCE(${alias}.origin, 'extracted') = :origin`, { origin: query.origin })
        if (query.sourceDocumentId)
            builder.andWhere(
                `(
            EXISTS (SELECT 1 FROM knowledge_graph_${alias}_contribution c WHERE c."${alias}Id" = ${alias}.id
                AND c."knowledgebaseId" = :knowledgebaseId AND c."sourceDocumentIdSnapshot" = :documentId)
            OR EXISTS (SELECT 1 FROM knowledge_graph_mention m WHERE m."${alias}Id" = ${alias}.id
                AND m."knowledgebaseId" = :knowledgebaseId AND m."documentId" = :documentId)
        )`,
                { documentId: query.sourceDocumentId }
            )
    }
    const [entities, relations] = await Promise.all([
        entityQuery.orderBy('entity.name', 'ASC').addOrderBy('entity.id', 'ASC').getMany(),
        relationQuery.getMany()
    ])
    return { entities, relations }
}

export async function readGraphCatalog(
    repository: Repository<KnowledgeGraphEntity>,
    knowledgebaseId: string,
    query?: KnowledgeGraphVisualizationQuery
): Promise<KnowledgeGraphCatalog> {
    const [documents, scope] = await Promise.all([
        repository.manager
            .getRepository(KnowledgeDocument)
            .createQueryBuilder('document')
            .select(['document.id', 'document.name'])
            .where('document.knowledgebaseId = :knowledgebaseId', { knowledgebaseId })
            .andWhere(
                `(EXISTS (SELECT 1 FROM knowledge_graph_entity_contribution c WHERE c."knowledgebaseId" = :knowledgebaseId
                AND c."sourceDocumentIdSnapshot" = document.id) OR EXISTS (SELECT 1 FROM knowledge_graph_mention m
                WHERE m."knowledgebaseId" = :knowledgebaseId AND m."documentId" = document.id))`
            )
            .orderBy('document.name', 'ASC')
            .getMany(),
        readGraphScope(repository, knowledgebaseId, { ...query, includeHidden: true })
    ])
    return {
        sources: documents.map(({ id, name }) => ({ id, name })),
        entities: scope.entities
            .filter(
                (entity) => query?.includeHidden || (entity.visibility ?? 'active') === (query?.visibility ?? 'active')
            )
            .map(({ id, name, type }) => ({ id, name, type })),
        hiddenNodes: scope.entities.filter((entity) => entity.visibility === 'hidden').length,
        hiddenRelations: scope.relations.filter((relation) => relation.visibility === 'hidden').length
    }
}

export async function readGraphVisualization(
    repository: Repository<KnowledgeGraphEntity>,
    knowledgebaseId: string,
    query?: KnowledgeGraphVisualizationQuery
) {
    const { entities, relations } = await readGraphScope(repository, knowledgebaseId, query)
    return buildGraphView(entities, relations, query)
}
