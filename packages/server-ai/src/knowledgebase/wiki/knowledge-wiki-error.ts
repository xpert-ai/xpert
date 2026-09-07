import { t } from 'i18next'

export type KnowledgeWikiErrorCode =
    | 'knowledge_wiki_empty_sources'
    | 'knowledge_wiki_empty_publication'
    | 'knowledge_wiki_index_failed'
    | 'knowledge_wiki_publication_conflict'

const messages: Record<KnowledgeWikiErrorCode, { key: string; defaultValue: string }> = {
    knowledge_wiki_empty_sources: {
        key: 'KnowledgebaseWikiEmptySources',
        defaultValue: 'Wiki rebuild found no usable sources. The published Wiki has been preserved.'
    },
    knowledge_wiki_empty_publication: {
        key: 'KnowledgebaseWikiEmptyPublication',
        defaultValue: 'Wiki rebuild produced no publishable pages. The published Wiki has been preserved.'
    },
    knowledge_wiki_index_failed: {
        key: 'KnowledgebaseWikiIndexFailed',
        defaultValue: 'Wiki search indexing failed. Retry to resume without replacing the published Wiki.'
    },
    knowledge_wiki_publication_conflict: {
        key: 'KnowledgebaseWikiFinalizeConflict',
        defaultValue: 'The Wiki page changed while its new version was being published'
    }
}

export class KnowledgeWikiError extends Error {
    constructor(
        readonly code: KnowledgeWikiErrorCode,
        readonly pageId?: string,
        readonly cause?: unknown
    ) {
        const message = messages[code]
        super(t(`server-ai:Error.${message.key}`, { defaultValue: message.defaultValue }))
    }
}
