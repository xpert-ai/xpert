import { And, Equal, FindOperator, FindOptionsWhere, Raw } from 'typeorm'
import type { KnowledgeDocument } from './document.entity'

/** Filter ordinary HTTP lists, not internal projection storage or retrieval readers. */
export function userDocumentListWhere(
    where: FindOptionsWhere<KnowledgeDocument> = {}
): FindOptionsWhere<KnowledgeDocument> {
    const userDocument = Raw((alias) => `((${alias})::jsonb -> 'systemManaged') IS DISTINCT FROM 'true'::jsonb`)
    const metadata = where.metadata
    return {
        ...where,
        metadata:
            metadata == null
                ? userDocument
                : And(userDocument, metadata instanceof FindOperator ? metadata : Equal(metadata))
    }
}
