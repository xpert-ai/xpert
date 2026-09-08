// Content scope must constrain candidates before Top K; it is not a user metadata filter.
import { DocumentInterface } from '@langchain/core/documents'
import { BadRequestException } from '@nestjs/common'
import { DocumentMetadata, KnowledgeRetrievalContentScope, isKnowledgeWikiChunkMetadata } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function parseKnowledgeRetrievalContentScope(value: unknown): KnowledgeRetrievalContentScope {
    if (value === undefined) return 'all'
    if (value === 'all' || value === 'original' || value === 'wiki') return value
    throw new BadRequestException(
        t('server-ai:Error.KnowledgeContentScopeInvalid', { defaultValue: 'Invalid retrieval content scope.' })
    )
}

export function postgresContentScopePredicate(scope?: KnowledgeRetrievalContentScope): string {
    if (scope === 'wiki') return `c."metadata" ->> 'contentKind' = 'wiki'`
    if (scope === 'original') return `c."metadata" ->> 'contentKind' IS DISTINCT FROM 'wiki'`
    return 'TRUE'
}

export function milvusContentScopePredicate(scope?: KnowledgeRetrievalContentScope): string {
    const field = 'filterAttributes["chunkMetadata"]["contentKind"]'
    if (scope === 'wiki') return `exists ${field} and ${field} == "wiki"`
    if (scope === 'original') return `(not exists ${field}) or ${field} != "wiki"`
    return ''
}

export function filterKnowledgeContentScope(
    documents: DocumentInterface<DocumentMetadata>[],
    scope: KnowledgeRetrievalContentScope
) {
    if (scope === 'all') return documents
    return documents.filter((document) =>
        scope === 'wiki' ? isKnowledgeWikiChunkMetadata(document.metadata) : document.metadata.contentKind !== 'wiki'
    )
}
