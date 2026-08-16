import { RequestContext } from '@xpert-ai/plugin-sdk'
import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { compileKnowledgeFilterToPostgres, normalizeFolderPath, prepareKnowledgeFilter } from '../../filter'
import { KnowledgebaseService } from '../../knowledgebase.service'
import {
    KnowledgeFolderOption,
    KnowledgeFolderOptionsQuery,
    KnowledgeFolderOptionsResult
} from '../knowledge-folder-options.query'

type FolderCandidate = {
    folderPath?: string | null
    directDocumentCount: number | string
}

@QueryHandler(KnowledgeFolderOptionsQuery)
export class KnowledgeFolderOptionsHandler implements IQueryHandler<KnowledgeFolderOptionsQuery> {
    constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

    async execute(query: KnowledgeFolderOptionsQuery): Promise<KnowledgeFolderOptionsResult> {
        const { input } = query
        const tenantId = input.tenantId ?? RequestContext.currentTenantId()
        const organizationId = input.organizationId ?? RequestContext.getOrganizationId()
        const result = await this.knowledgebaseService.findAll({
            where: {
                id: input.knowledgebaseId,
                tenantId,
                organizationId
            }
        })
        const knowledgebase = result.items[0]
        if (!knowledgebase) {
            throw new NotFoundException(`Knowledgebase '${input.knowledgebaseId}' was not found.`)
        }

        // Directory discovery is constrained by the same administrator-managed fixed
        // boundary as retrieval. Missing or invalid fixed variables fail closed here.
        const prepared = prepareKnowledgeFilter({
            knowledgebase,
            filters: { fixed: input.fixedFilter },
            variables: input.variables
        })
        const compiled = prepared.effective
            ? compileKnowledgeFilterToPostgres(prepared.effective, prepared.registry)
            : { sql: 'TRUE', parameters: [] }
        const candidates = await this.knowledgebaseService.listStructuredFilterFolderCandidates(
            knowledgebase.id,
            tenantId,
            organizationId,
            compiled
        )

        const options = buildKnowledgeFolderOptions(candidates, input.search)
        const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)))
        const offset = Math.max(0, Math.trunc(input.offset ?? 0))
        const nextOffset = offset + limit < options.length ? offset + limit : undefined
        return {
            knowledgebaseId: knowledgebase.id,
            items: options.slice(offset, offset + limit),
            total: options.length,
            truncated: nextOffset != null,
            nextOffset
        }
    }
}

/**
 * Converts folders containing eligible chunks into selectable exact and ancestor
 * values. Ancestors are useful with the `under` operator even when they contain no
 * documents directly.
 */
export function buildKnowledgeFolderOptions(candidates: FolderCandidate[], search?: string): KnowledgeFolderOption[] {
    const directCounts = new Map<string, number>()
    for (const candidate of candidates) {
        const folderPath = normalizeFolderPath(String(candidate.folderPath ?? ''))
        directCounts.set(folderPath, (directCounts.get(folderPath) ?? 0) + Number(candidate.directDocumentCount ?? 0))
    }

    const descendantCounts = new Map<string, number>()
    for (const [folderPath, count] of directCounts) {
        const segments = folderPath ? folderPath.split('/') : []
        for (let depth = 0; depth <= segments.length; depth += 1) {
            const ancestor = segments.slice(0, depth).join('/')
            descendantCounts.set(ancestor, (descendantCounts.get(ancestor) ?? 0) + count)
        }
    }

    const normalizedSearch = search?.trim().toLocaleLowerCase()
    return [...descendantCounts.entries()]
        .map(([folderPath, documentCount]) => {
            const segments = folderPath ? folderPath.split('/') : []
            return {
                folderPath,
                name: segments.at(-1) ?? '/',
                parentPath: segments.length ? segments.slice(0, -1).join('/') : null,
                depth: segments.length,
                directDocumentCount: directCounts.get(folderPath) ?? 0,
                documentCount
            }
        })
        .filter(
            (option) =>
                !normalizedSearch ||
                option.folderPath.toLocaleLowerCase().includes(normalizedSearch) ||
                option.name.toLocaleLowerCase().includes(normalizedSearch)
        )
        .sort((left, right) => left.folderPath.localeCompare(right.folderPath))
}
