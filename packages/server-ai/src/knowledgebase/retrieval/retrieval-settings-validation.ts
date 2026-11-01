import { BadRequestException } from '@nestjs/common'
import { hasEnabledKnowledgeRetrievalSource, IKnowledgebase, isDocumentKnowledgebaseType } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function assertKnowledgebaseRetrievalSettings(knowledgebase: Partial<IKnowledgebase>) {
    const documentKnowledgebase = isDocumentKnowledgebaseType(knowledgebase.type)
    const scope =
        documentKnowledgebase && knowledgebase.wikiConfig?.enabled
            ? (knowledgebase.recall?.contentScope ?? 'all')
            : 'all'
    if (!hasEnabledKnowledgeRetrievalSource(knowledgebase, documentKnowledgebase, scope)) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgeRetrievalSourceRequired', {
                defaultValue:
                    'Select at least one retrieval source available for the selected content scope with a positive weight.'
            })
        )
    }
}
