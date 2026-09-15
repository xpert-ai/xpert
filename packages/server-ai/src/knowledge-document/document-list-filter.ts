import { And, Equal, FindOperator, FindOptionsWhere, Raw } from 'typeorm'
import type { KnowledgeDocument } from './document.entity'
import { KNOWLEDGE_DOCUMENT_AGENT_WRITER_TYPE } from '@xpert-ai/contracts'

export function visibleDocumentSql(metadata: string): string {
    return `((${metadata})::jsonb -> 'systemManaged' IS DISTINCT FROM 'true'::jsonb OR (${metadata})::jsonb ->> 'systemManagedType' = '${KNOWLEDGE_DOCUMENT_AGENT_WRITER_TYPE}')`
}

/** Filter ordinary HTTP lists, not internal projection storage or retrieval readers. */
export function userDocumentListWhere(
    where: FindOptionsWhere<KnowledgeDocument> = {}
): FindOptionsWhere<KnowledgeDocument> {
    const userDocument = Raw(visibleDocumentSql)
    const metadata = where.metadata
    return {
        ...where,
        metadata:
            metadata == null
                ? userDocument
                : And(userDocument, metadata instanceof FindOperator ? metadata : Equal(metadata))
    }
}
