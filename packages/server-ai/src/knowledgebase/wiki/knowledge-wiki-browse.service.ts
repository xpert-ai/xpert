import { Injectable } from '@nestjs/common'
import { EntityManager, SelectQueryBuilder } from 'typeorm'
import type {
    KnowledgeWikiGraph,
    KnowledgeWikiGraphParams,
    KnowledgeWikiPageListItem,
    KnowledgeWikiPageListParams,
    KnowledgeWikiTaxonomy,
    KnowledgeWikiTaxonomyQuery
} from '@xpert-ai/contracts'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiPage, KnowledgeWikiPageVersion, KnowledgeWikiPageLinkEntity } from './entities'
import { KnowledgeWikiPlacement, KnowledgeWikiFolder } from './entities/knowledge-wiki-organization.entity'
import { KnowledgeWikiOrganizationService } from './knowledge-wiki-organization.service'
import { selectWikiGraph, wikiOrganizationError } from './knowledge-wiki-organization.utils'

type WikiRow = KnowledgeWikiPageListItem & {
    sourceCount: number
    folderId: string | null
    placementSource: 'automatic' | 'manual' | null
    placementVersion: number | null
    activeVersionId: string
}

// All browse projections share active-version and source eligibility checks before pagination/counting.
export function visibleWikiPages(manager: EntityManager, kb: Knowledgebase): SelectQueryBuilder<KnowledgeWikiPage> {
    return manager
        .getRepository(KnowledgeWikiPage)
        .createQueryBuilder('page')
        .innerJoin(
            KnowledgeWikiPageVersion,
            'version',
            'version.id = page."activeVersionId" AND version."pageId" = page.id AND version."knowledgebaseId" = page."knowledgebaseId"'
        )
        .leftJoin(
            KnowledgeWikiPlacement,
            'placement',
            'placement."pageId" = page.id AND placement."knowledgebaseId" = page."knowledgebaseId"'
        )
        .where('page."knowledgebaseId" = :kb', { kb: kb.id })
        .andWhere('page."tenantId" IS NOT DISTINCT FROM :tenant AND page."organizationId" IS NOT DISTINCT FROM :org', {
            tenant: kb.tenantId ?? null,
            org: kb.organizationId ?? null
        })
        .andWhere(
            'version."tenantId" IS NOT DISTINCT FROM page."tenantId" AND version."organizationId" IS NOT DISTINCT FROM page."organizationId"'
        )
        .andWhere(
            "page.status = 'ready' AND page.\"projectionStatus\" = 'ready' AND version.status = 'ready' AND version.\"projectionStatus\" = 'ready'"
        ).andWhere(`NOT EXISTS (
            SELECT 1 FROM knowledge_wiki_page_evidence e
            WHERE e."pageVersionId" = version.id AND e."knowledgebaseId" = page."knowledgebaseId"
            AND NOT EXISTS (
                SELECT 1 FROM knowledge_wiki_source_state s
                WHERE s."knowledgebaseId" = page."knowledgebaseId"
                AND s."tenantId" IS NOT DISTINCT FROM page."tenantId"
                AND s."organizationId" IS NOT DISTINCT FROM page."organizationId"
                AND s."sourceDocumentIdSnapshot" = e."sourceDocumentIdSnapshot"
                AND s.eligible = true AND s."cleanupPending" = false
                AND s."lastContentHash" = e."sourceContentHash"
            )
        )`)
}

export function wikiPageRows(query: SelectQueryBuilder<KnowledgeWikiPage>) {
    return query
        .select([
            'page.id AS "id"',
            'page."identityId" AS "identityId"',
            'page."pageKey" AS "pageKey"',
            'page."pageType" AS "pageType"',
            'page."canonicalName" AS "canonicalName"',
            'page.slug AS "slug"',
            'page.status AS "status"',
            'page."projectionStatus" AS "projectionStatus"',
            'page."updatedAt" AS "updatedAt"',
            'page."sourceCount" AS "sourceCount"',
            'page."activeVersionId" AS "activeVersionId"',
            'version.title AS "title"',
            'version.summary AS "summary"',
            'version.aliases AS "aliases"',
            'placement."folderId" AS "folderId"',
            'placement.source AS "placementSource"',
            'placement.version AS "placementVersion"'
        ])
        .getRawMany<WikiRow>()
}
function toPage(row: WikiRow): KnowledgeWikiPageListItem {
    return {
        id: row.id,
        identityId: row.identityId,
        pageKey: row.pageKey,
        pageType: row.pageType,
        canonicalName: row.canonicalName,
        title: row.title,
        slug: row.slug,
        summary: row.summary,
        aliases: row.aliases,
        status: row.status,
        projectionStatus: row.projectionStatus,
        updatedAt: row.updatedAt,
        ...(row.placementSource
            ? { placement: { folderId: row.folderId, source: row.placementSource, version: row.placementVersion } }
            : {})
    }
}

function filterWikiPages(query: SelectQueryBuilder<KnowledgeWikiPage>, input: KnowledgeWikiTaxonomyQuery) {
    if (input.pageGroup)
        query.andWhere('page."pageType" IN (:...groupTypes)', {
            groupTypes: input.pageGroup === 'knowledge' ? ['entity', 'concept'] : ['summary']
        })
    if (input.pageType) query.andWhere('page."pageType" = :type', { type: input.pageType })
    if (input.search?.trim())
        query.andWhere('(version.title ILIKE :search OR page."canonicalName" ILIKE :search)', {
            search: `%${input.search.trim()}%`
        })
    return query
}

@Injectable()
export class KnowledgeWikiBrowseService {
    constructor(private readonly organization: KnowledgeWikiOrganizationService) {}

    async placement(id: string, pageId: string) {
        await this.organization.authorize(id)
        const placement = await this.organization.dataSource
            .getRepository(KnowledgeWikiPlacement)
            .findOneBy({ knowledgebaseId: id, pageId })
        return placement
            ? { folderId: placement.folderId, source: placement.source, version: placement.version }
            : undefined
    }

    async list(id: string, input: KnowledgeWikiPageListParams) {
        const kb = await this.organization.authorize(id)
        const take = input.take ?? 50,
            skip = input.skip ?? 0
        if (
            !Number.isInteger(take) ||
            take < 1 ||
            take > 100 ||
            !Number.isInteger(skip) ||
            skip < 0 ||
            (input.folderId && input.unclassified)
        )
            throw wikiOrganizationError()
        return this.organization.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const query = filterWikiPages(visibleWikiPages(manager, kb), input)
            if (input.folderId) query.andWhere('placement."folderId" = :folder', { folder: input.folderId })
            if (input.unclassified)
                query.andWhere('placement."folderId" IS NULL AND page."pageType" <> :index', { index: 'index' })
            const total = await query.clone().getCount()
            const rows = await wikiPageRows(
                query.orderBy('page."updatedAt"', 'DESC').addOrderBy('page.id', 'ASC').limit(take).offset(skip)
            )
            return { items: rows.map(toPage), total }
        })
    }

    async taxonomy(id: string, input: KnowledgeWikiTaxonomyQuery = {}): Promise<KnowledgeWikiTaxonomy> {
        const kb = await this.organization.authorize(id)
        return this.organization.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const config = await this.organization.taxonomy(manager, kb)
            const folders = await manager
                .getRepository(KnowledgeWikiFolder)
                .find({ where: { knowledgebaseId: id }, order: { position: 'ASC', name: 'ASC', id: 'ASC' } })
            const query = filterWikiPages(visibleWikiPages(manager, kb), input)
            const counts = await query
                .clone()
                .select('placement."folderId"', 'folderId')
                .addSelect('COUNT(*)::int', 'count')
                .andWhere('page."pageType" <> :index', { index: 'index' })
                .groupBy('placement."folderId"')
                .getRawMany<{ folderId: string | null; count: number }>()
            const countMap = new Map(counts.map((row) => [row.folderId, row.count]))
            return {
                enabled: config.enabled,
                revision: config.revision,
                folders: folders.map((folder) => ({
                    id: folder.id,
                    parentId: folder.parentId,
                    name: folder.name,
                    description: folder.description,
                    position: folder.position,
                    version: folder.version,
                    pageCount: countMap.get(folder.id) ?? 0
                })),
                unclassifiedCount: countMap.get(null) ?? 0,
                total: await query.getCount()
            }
        })
    }

    async graph(id: string, input: KnowledgeWikiGraphParams): Promise<KnowledgeWikiGraph> {
        const kb = await this.organization.authorize(id)
        const take = input.take ?? 150,
            depth = input.depth ?? 1
        if (!Number.isInteger(take) || take < 1 || take > 300 || ![1, 2].includes(depth)) throw wikiOrganizationError()
        return this.organization.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const query = visibleWikiPages(manager, kb)
            if (!input.includeIndex) query.andWhere('page."pageType" <> :index', { index: 'index' })
            if (input.pageType) query.andWhere('page."pageType" = :type', { type: input.pageType })
            if (input.focusPageId)
                query
                    .orderBy('CASE WHEN page.id = :focus THEN 0 ELSE 1 END', 'ASC')
                    .setParameter('focus', input.focusPageId)
            const rows = await wikiPageRows(query.addOrderBy('page.id', 'ASC').limit(5001))
            const pages = rows.slice(0, 5000)
            const nodes = pages.map((row) => ({ ...toPage(row), sourceCount: row.sourceCount }))
            if (!nodes.length) return { nodes: [], edges: [], truncated: false }
            const links = await manager
                .getRepository(KnowledgeWikiPageLinkEntity)
                .createQueryBuilder('link')
                .where('link."knowledgebaseId" = :id', { id })
                .andWhere('link."sourcePageId" IN (:...ids) AND link."targetPageId" IN (:...ids)', {
                    ids: nodes.map((node) => node.id)
                })
                .andWhere(
                    'link."tenantId" IS NOT DISTINCT FROM :tenant AND link."organizationId" IS NOT DISTINCT FROM :org',
                    { tenant: kb.tenantId ?? null, org: kb.organizationId ?? null }
                )
                .andWhere('link."sourcePageVersionId" IN (:...versions)', {
                    versions: pages.map((page) => page.activeVersionId)
                })
                .orderBy('link.id', 'ASC')
                .take(20001)
                .getMany()
            const versions = new Map(pages.map((page) => [page.id, page.activeVersionId]))
            const edges = links
                .slice(0, 20000)
                .filter((link) => versions.get(link.sourcePageId) === link.sourcePageVersionId)
                .map((link) => ({
                    id: link.id,
                    source: link.sourcePageId,
                    target: link.targetPageId,
                    label: link.label,
                    sectionAnchor: link.sectionAnchor
                }))
            const graph = selectWikiGraph(nodes, edges, input.focusPageId, depth, take)
            return { ...graph, truncated: graph.truncated || rows.length > 5000 || links.length > 20000 }
        })
    }
}
