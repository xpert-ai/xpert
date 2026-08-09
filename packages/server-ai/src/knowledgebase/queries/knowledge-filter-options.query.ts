import { KnowledgeFilterJSONValue, KnowledgeFilterNode, MetadataFieldType } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export type KnowledgeFilterOptionValue = {
    value: KnowledgeFilterJSONValue
    documentCount: number
    chunkCount: number
}

export type KnowledgeFilterValueOptionsResult = {
    knowledgebaseId: string
    field: string
    fieldType: MetadataFieldType
    optionKind: 'values' | 'arrayValues' | 'rangeValues' | 'existence'
    items: KnowledgeFilterOptionValue[]
    total: number
    truncated: boolean
    nextOffset?: number
    statistics: {
        eligibleDocumentCount: number
        eligibleChunkCount: number
        existingDocumentCount: number
        existingChunkCount: number
        min?: KnowledgeFilterJSONValue
        max?: KnowledgeFilterJSONValue
    }
}

export class KnowledgeFilterValueOptionsQuery implements IQuery {
    static readonly type = '[Knowledgebase] Filter value options'

    constructor(
        public readonly input: {
            tenantId?: string
            organizationId?: string
            knowledgebaseId: string
            field: string
            fixedFilter?: KnowledgeFilterNode
            /** Runtime state used only to resolve mandatory fixed-filter variables. */
            variables?: Record<string, unknown>
            search?: string
            limit?: number
            offset?: number
        }
    ) {}
}
