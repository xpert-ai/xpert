import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { compileKnowledgeFilterToPostgres, prepareKnowledgeFilter } from '../../filter'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeFilterValueOptionsQuery, KnowledgeFilterValueOptionsResult } from '../knowledge-filter-options.query'

@QueryHandler(KnowledgeFilterValueOptionsQuery)
export class KnowledgeFilterValueOptionsHandler implements IQueryHandler<KnowledgeFilterValueOptionsQuery> {
    constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

    async execute(query: KnowledgeFilterValueOptionsQuery): Promise<KnowledgeFilterValueOptionsResult> {
        const { input } = query
        const knowledgebase = await this.knowledgebaseService.findOne(input.knowledgebaseId)
        const tenantId = knowledgebase.tenantId ?? input.tenantId ?? RequestContext.currentTenantId()
        const organizationId =
            knowledgebase.organizationId ?? input.organizationId ?? RequestContext.getOrganizationId()

        const prepared = prepareKnowledgeFilter({
            knowledgebase,
            filters: { fixed: input.fixedFilter },
            variables: input.variables
        })
        const definition = prepared.registry.get(input.field)
        if (!definition?.agentVisible || input.field === 'document.folderPath') {
            throw new BadRequestException(`Filter options are not available for field '${input.field}'.`)
        }
        const compiled = prepared.effective
            ? compileKnowledgeFilterToPostgres(prepared.effective, prepared.registry)
            : { sql: 'TRUE', parameters: [] }
        const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)))
        const offset = Math.max(0, Math.trunc(input.offset ?? 0))
        const values = await this.knowledgebaseService.listStructuredFilterValueCandidates(
            knowledgebase.id,
            tenantId,
            organizationId,
            compiled,
            definition,
            {
                search: input.search,
                allowedValues: definition.enumValues,
                limit,
                offset
            }
        )
        const nextOffset = offset + limit < values.total ? offset + limit : undefined

        return {
            knowledgebaseId: knowledgebase.id,
            field: definition.field,
            fieldType: definition.type,
            optionKind: resolveOptionKind(definition.type),
            items: values.items,
            total: values.total,
            truncated: nextOffset != null,
            nextOffset,
            statistics: values.statistics
        }
    }
}

function resolveOptionKind(type: string): KnowledgeFilterValueOptionsResult['optionKind'] {
    if (type === 'object') return 'existence'
    if (type.endsWith('[]')) return 'arrayValues'
    if (type === 'number' || type === 'datetime') return 'rangeValues'
    return 'values'
}
