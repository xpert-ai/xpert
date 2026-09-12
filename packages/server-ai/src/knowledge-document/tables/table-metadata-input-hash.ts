import type { IKnowledgebase, IKnowledgeDocument } from '@xpert-ai/contracts'
import { computeStableHash, resolveKnowledgeDocumentSourceHash } from '../document-hash'
import { resolveKnowledgeDocumentParserConfig } from '../parser-config'

/** Stable input excludes progress, index hashes and generated output to avoid self-invalidating generations. */
export function tableMetadataInputHash(
    document: Pick<
        IKnowledgeDocument,
        'sourceHash' | 'metadata' | 'filePath' | 'type' | 'category' | 'parserConfig' | 'sourceConfig'
    >,
    knowledgebase: IKnowledgebase
) {
    const config = resolveKnowledgeDocumentParserConfig(document)
    const model = knowledgebase.chatModel
    return computeStableHash({
        schema: 1,
        generationRules: 3,
        sourceHash: resolveKnowledgeDocumentSourceHash(document),
        filePath: document.filePath,
        type: document.type,
        spreadsheet: config.spreadsheet,
        fields: config.fields,
        indexedFields: config.indexedFields,
        instructions: config.tableMetadataRequirements?.trim() ?? '',
        model: model
            ? {
                  id: model.id,
                  model: model.model,
                  copilotId: model.copilotId,
                  referencedId: model.referencedId,
                  options: model.options,
                  referencedModel: model.referencedModel
                      ? {
                            id: model.referencedModel.id,
                            model: model.referencedModel.model,
                            copilotId: model.referencedModel.copilotId,
                            options: model.referencedModel.options
                        }
                      : undefined
              }
            : null
    })
}
