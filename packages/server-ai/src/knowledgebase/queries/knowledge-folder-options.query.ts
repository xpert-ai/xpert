import { KnowledgeFilterNode } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export type KnowledgeFolderOption = {
    /** Canonical, knowledgebase-relative value for document.folderPath. */
    folderPath: string
    /** Last logical path segment, or '/' for the knowledgebase root. */
    name: string
    parentPath: string | null
    depth: number
    /** Documents directly in this folder after the mandatory fixed boundary is applied. */
    directDocumentCount: number
    /** Documents in this folder and its descendants after the mandatory fixed boundary is applied. */
    documentCount: number
}

export type KnowledgeFolderOptionsResult = {
    knowledgebaseId: string
    items: KnowledgeFolderOption[]
    total: number
    truncated: boolean
    nextOffset?: number
}

export class KnowledgeFolderOptionsQuery implements IQuery {
    static readonly type = '[Knowledgebase] Folder filter options'

    constructor(
        public readonly input: {
            tenantId?: string
            organizationId?: string
            knowledgebaseId: string
            fixedFilter?: KnowledgeFilterNode
            /** Runtime state used only to resolve mandatory fixed-filter variables. */
            variables?: Record<string, unknown>
            search?: string
            limit?: number
            offset?: number
        }
    ) {}
}
