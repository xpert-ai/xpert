import {
    BUILTIN_KNOWLEDGE_FILE_TYPES,
    BUILTIN_KNOWLEDGE_PARSER,
    IKnowledgeDocument,
    KnowledgeParserSelection,
    knowledgeDocumentFileType
} from '@xpert-ai/contracts'
import {
    DocumentTransformerRegistry,
    IDocumentTransformerStrategy,
    TDocumentTransformerConfig
} from '@xpert-ai/plugin-sdk'
import { invalidKnowledgeParserConfig } from './parser-validation'

/** Validate the selected format before invoking a converter; never substitute another provider. */
export function knowledgeParserProvider(
    registry: DocumentTransformerRegistry,
    type: string,
    selection: KnowledgeParserSelection,
    allowLegacy = false
): IDocumentTransformerStrategy {
    const format = knowledgeDocumentFileType({ type })
    let name = selection.transformerType
    if (name === BUILTIN_KNOWLEDGE_PARSER) {
        if (!BUILTIN_KNOWLEDGE_FILE_TYPES.includes(format)) throw invalidKnowledgeParserConfig(`builtin: ${format}`)
        name = format === 'pdf' ? 'pdf-visual' : 'default'
    }
    const provider = registry.get(name)
    if (!provider) throw invalidKnowledgeParserConfig(name)
    if (
        !(allowLegacy && selection.transformerType === 'default') &&
        (!allowLegacy || provider.meta.supportedFileTypes) &&
        !provider.meta.supportedFileTypes?.some((value) => knowledgeDocumentFileType({ type: value }) === format)
    ) {
        throw invalidKnowledgeParserConfig(`${name}: ${format}`)
    }
    return provider
}

export function validateParserIntegration(provider: IDocumentTransformerStrategy, config: TDocumentTransformerConfig) {
    const permission = provider.permissions?.find((item) => item.type === 'integration')
    if (
        permission &&
        (!config.permissions?.integration || config.permissions.integration.provider !== permission.service)
    ) {
        throw invalidKnowledgeParserConfig(`transformerIntegration: ${permission.service}`)
    }
}

export function validateTableParserSelection(document: Partial<IKnowledgeDocument>) {
    if (document.sourceConfig) return
    const format = knowledgeDocumentFileType(document)
    const parser = document.parserConfig
    if (
        ['csv', 'xls', 'xlsx'].includes(format) &&
        parser?.transformerType &&
        !['default', BUILTIN_KNOWLEDGE_PARSER].includes(parser.transformerType) &&
        parser.spreadsheet?.interpretation !== 'form_document'
    ) {
        throw invalidKnowledgeParserConfig('spreadsheet records require the builtin parser')
    }
}
