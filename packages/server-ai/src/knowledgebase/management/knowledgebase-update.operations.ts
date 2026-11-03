import { KnowledgeResourceAccessService } from '../runtime/knowledge-resource-access.service'
import { KnowledgeKeywordAnalyzerService } from '../analyzer/keyword-analyzer.service'
import { VectorStoreSettingsService } from '../../rag-vstore/vector-store-settings.service'

import { prepareAutomaticTaggingConfig } from '../tags/automatic-tagging-config'

import { resolveKnowledgeDocumentParserConfig } from '../../knowledge-document/parser-config'
import { KnowledgeParserSettingsService } from '../parser/parser-settings.service'
import {
    incompatibleKnowledgeChunkStructure,
    invalidKnowledgeParserConfig
} from '../../knowledge-document/parser-validation'

import {
    DocumentTypeEnum,
    KnowledgebaseStatusEnum,
    KnowledgebaseTypeEnum,
    mapTranslationLanguage,
    KnowledgeStructureEnum,
    KnowledgeGraphStatus,
    KBMetadataFieldDef,
    MetadataFieldType,
    normalizeKnowledgebaseFAQRecall,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'

import { BadRequestException } from '@nestjs/common'

import { t } from 'i18next'
import { assign } from 'lodash'
import { I18nService } from 'nestjs-i18n'

import { IsNull, Not, QueryFailedError, Repository } from 'typeorm'

import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { assertKnowledgebaseRetrievalSettings } from '../retrieval/retrieval-settings-validation'
import { resolveEmbeddingModelUpdateState } from '../embedding/embedding-state'

import { KnowledgeDocumentService } from '../../knowledge-document/document.service'

import { assertNoClientWikiState } from '../wiki/knowledge-wiki-config'
import {
    KnowledgeWikiConfigurationUpdate,
    prepareKnowledgeWikiConfiguration
} from '../wiki/knowledge-wiki-configuration'
import { RequestContext } from '@xpert-ai/plugin-sdk'

import type { KnowledgebaseService } from './knowledgebase.service'

import { getQueryFailedErrorCode } from './knowledgebase-update-policy'

interface KnowledgebaseUpdateOperationsContext {
    assertKnowledgebaseWriteAccess: KnowledgebaseService['assertKnowledgebaseWriteAccess']
    documentService: KnowledgeDocumentService
    findOneByIdString: KnowledgebaseService['findOneByIdString']
    i18nService: I18nService
    keywordAnalyzers: KnowledgeKeywordAnalyzerService
    parserSettings: KnowledgeParserSettingsService
    repository: Repository<Knowledgebase>
    resolveEmbeddingModelTarget: KnowledgebaseService['resolveEmbeddingModelTarget']
    resourceAccess: KnowledgeResourceAccessService
    saveSettings: (entity: Knowledgebase) => Promise<Knowledgebase>
    startEmbeddingRebuild: KnowledgebaseService['startEmbeddingRebuild']
    vectorStoreSettings: VectorStoreSettingsService
}

export class KnowledgebaseUpdateOperations {
    constructor(private readonly context: KnowledgebaseUpdateOperationsContext) {}

    async updateKnowledgebase(
        id: string,
        entity: Partial<Knowledgebase>,
        wikiInput?: KnowledgeWikiConfigurationUpdate
    ) {
        const { resourceRef: _resourceRef, ...settings } = entity
        entity = settings
        await this.context.resourceAccess?.authorize(id, 'manage')
        const _entity = await this.context.assertKnowledgebaseWriteAccess(id, {
            relations: [
                'copilotModel',
                'copilotModel.copilot',
                'copilotModel.copilot.modelProvider',
                'chatModel',
                'chatModel.copilot',
                'chatModel.copilot.modelProvider',
                'pendingCopilotModel',
                'pendingCopilotModel.copilot',
                'pendingCopilotModel.copilot.modelProvider',
                ...(wikiInput ? ['wikiModel'] : [])
            ]
        })
        const changes = { ...entity }
        // Readback state is not writable configuration. Only the rebuild lifecycle
        // may claim tasks, promote indices or clear a saved target.
        for (const field of [
            'status',
            'embeddingCollectionName',
            'embeddingModelFingerprint',
            'embeddingDimensions',
            'embeddingRevision',
            'pendingCopilotModel',
            'pendingCopilotModelId',
            'pendingEmbeddingCollectionName',
            'pendingEmbeddingModelFingerprint',
            'pendingEmbeddingDimensions',
            'pendingEmbeddingRevision',
            'rebuildTaskId',
            'embeddingRebuildError'
        ] as const) {
            delete changes[field]
        }
        delete changes.keywordAnalyzerLocked
        const hasKeywordAnalyzer = Object.prototype.hasOwnProperty.call(changes, 'keywordAnalyzer')
        delete changes.keywordAnalyzer
        this.context.vectorStoreSettings.assertUnchanged(_entity.vectorStore, changes.vectorStore)
        delete changes.vectorStore
        if ('automaticTagging' in changes)
            changes.automaticTagging = prepareAutomaticTaggingConfig(changes.automaticTagging)
        delete changes.id
        delete changes.tenantId
        delete changes.tenant
        delete changes.organizationId
        delete changes.organization
        delete changes.createdById
        delete changes.createdBy
        delete changes.updatedById
        delete changes.updatedBy
        delete changes.createdAt
        delete changes.updatedAt
        delete changes.deletedAt
        if (changes.workspaceId && changes.workspaceId !== _entity.workspaceId) {
            throw new BadRequestException('workspaceId cannot be changed after a knowledgebase is created')
        }
        delete changes.workspaceId
        if (
            Object.prototype.hasOwnProperty.call(changes, 'workspace') &&
            (changes.workspace?.id ?? null) !== (_entity.workspaceId ?? null)
        ) {
            throw new BadRequestException('workspace cannot be changed after a knowledgebase is created')
        }
        delete changes.workspace
        if (Object.prototype.hasOwnProperty.call(changes, 'type')) {
            if (changes.type !== _entity.type) {
                throw new BadRequestException(
                    t('server-ai:Error.KnowledgebaseTypeImmutable', {
                        defaultValue: 'Knowledgebase type cannot be changed after creation'
                    })
                )
            }
            delete changes.type
        }
        if (Object.prototype.hasOwnProperty.call(changes, 'faqConfig')) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseFAQConfigImmutable', {
                    defaultValue: 'FAQ configuration cannot be changed after a knowledgebase is created'
                })
            )
        }
        if (Object.prototype.hasOwnProperty.call(changes, 'wikiConfig')) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiConfigManagedSeparately', {
                    defaultValue: 'Wiki configuration must be changed through the Wiki configuration API'
                })
            )
        }
        if (
            Object.prototype.hasOwnProperty.call(changes, 'wikiModel') ||
            Object.prototype.hasOwnProperty.call(changes, 'wikiModelId')
        ) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiConfigManagedSeparately', {
                    defaultValue: 'Wiki configuration must be changed through the Wiki configuration API'
                })
            )
        }
        if (_entity.type === KnowledgebaseTypeEnum.Standard && changes.parserConfig) {
            changes.structure = await this.context.parserSettings.validateSettings(changes.parserConfig)
        }
        if (changes.structure && changes.structure !== _entity.structure) {
            await this.assertChunkStructureChange(_entity, changes.structure)
        }
        assertNoClientWikiState(changes)
        if (
            _entity.type === KnowledgebaseTypeEnum.FAQ &&
            (Object.prototype.hasOwnProperty.call(changes, 'recall') ||
                Object.prototype.hasOwnProperty.call(changes, 'graphRag'))
        ) {
            changes.recall = normalizeKnowledgebaseFAQRecall({
                ...(_entity.recall ?? {}),
                ...(changes.recall ?? {}),
                fusion: {
                    ...(_entity.recall?.fusion ?? {}),
                    ...(changes.recall?.fusion ?? {}),
                    weights: {
                        ...(_entity.recall?.fusion?.weights ?? {}),
                        ...(changes.recall?.fusion?.weights ?? {})
                    }
                }
            })
            changes.graphRag = {
                ...(_entity.graphRag ?? {}),
                ...(changes.graphRag ?? {}),
                enabled: false,
                mode: changes.recall.mode
            }
        }

        // Check name uniqueness if name is being changed
        if (changes.name && changes.name !== _entity.name) {
            const tenantId = RequestContext.currentTenantId()
            const organizationId = RequestContext.getOrganizationId()

            // Check if another knowledgebase with the same name exists (excluding current one)
            const exist = await this.context.repository.findOne({
                where: {
                    tenantId,
                    organizationId,
                    name: changes.name,
                    id: Not(id) // Exclude current knowledgebase
                }
            })

            if (exist) {
                throw new BadRequestException(
                    this.context.i18nService.t('xpert.Error.NameExists', {
                        lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                    })
                )
            }
        }

        const wikiPatch = wikiInput
            ? prepareKnowledgeWikiConfiguration(
                  _entity,
                  wikiInput,
                  Object.prototype.hasOwnProperty.call(changes, 'chatModel') ? changes.chatModel : _entity.chatModel
              )
            : {}

        if ('recall' in changes || 'graphRag' in changes || wikiInput) {
            assertKnowledgebaseRetrievalSettings({ ..._entity, ...changes, ...wikiPatch })
        }

        try {
            if (Object.prototype.hasOwnProperty.call(changes, 'metadataSchema')) {
                changes.metadataSchema = this.validateAndNormalizeMetadataSchema(changes.metadataSchema)
            }
            if (Object.prototype.hasOwnProperty.call(entity, 'applicationTags')) {
                entity.applicationTags = this.normalizeApplicationTags(entity.applicationTags)
            }
            const hasCopilotModel = Object.prototype.hasOwnProperty.call(entity, 'copilotModel')
            const hasCopilotModelId = Object.prototype.hasOwnProperty.call(entity, 'copilotModelId')
            const hasEmbeddingModelChange = hasCopilotModel || hasCopilotModelId
            let embeddingPatch: Partial<Knowledgebase> = {}
            if (hasEmbeddingModelChange) {
                if (_entity.status === KnowledgebaseStatusEnum.REBUILDING) {
                    throw new BadRequestException('Embedding rebuild is running')
                }
                if (!hasCopilotModel && changes.copilotModelId !== _entity.copilotModelId) {
                    throw new BadRequestException('copilotModel is required when changing embedding model')
                }
                if (hasCopilotModel) {
                    const target = await this.context.resolveEmbeddingModelTarget(
                        id,
                        changes.copilotModel ?? null,
                        changes.copilotModelId ?? null
                    )
                    embeddingPatch = resolveEmbeddingModelUpdateState(_entity, target) as Partial<Knowledgebase>
                }
            }
            if (Object.prototype.hasOwnProperty.call(changes, 'graphRag')) {
                const nextGraphEnabled = changes.graphRag?.enabled === true
                const currentGraphEnabled = _entity.graphRag?.enabled === true
                if (!nextGraphEnabled) {
                    changes.graphStatus = KnowledgeGraphStatus.DISABLED
                    changes.graphIndexError = null
                } else if (!currentGraphEnabled || _entity.graphStatus === KnowledgeGraphStatus.DISABLED) {
                    changes.graphStatus = KnowledgeGraphStatus.REBUILD_REQUIRED
                    changes.graphIndexError = null
                }
            }
            const generalModelChanged =
                Object.prototype.hasOwnProperty.call(changes, 'chatModel') ||
                Object.prototype.hasOwnProperty.call(changes, 'chatModelId')
            if (
                normalizeKnowledgebaseWikiConfig(_entity.wikiConfig).enabled &&
                !_entity.wikiModelId &&
                generalModelChanged
            ) {
                changes.wikiStatus = 'rebuild_required'
                changes.wikiAvailability = _entity.wikiActiveRevision ? 'degraded' : 'unavailable'
                changes.wikiBuildError = null
            }
            assign(_entity, changes, embeddingPatch, wikiPatch)
            _entity.updatedById = RequestContext.currentUserId()
            const saved = hasKeywordAnalyzer
                ? await this.context.keywordAnalyzers.saveSettings(_entity, entity.keywordAnalyzer)
                : await this.context.saveSettings(_entity)
            if (embeddingPatch.status === KnowledgebaseStatusEnum.REBUILD_REQUIRED) {
                return await this.context.startEmbeddingRebuild(id)
            }
            return saved
        } catch (error) {
            // Catch database unique constraint errors as a fallback
            // PostgreSQL error code for unique violation: 23505
            // MySQL error code for duplicate entry: 1062
            if (error instanceof QueryFailedError) {
                const errorCode = getQueryFailedErrorCode(error)
                if (
                    errorCode === '23505' ||
                    errorCode === 1062 ||
                    error.message?.includes('duplicate key') ||
                    error.message?.includes('UNIQUE constraint') ||
                    error.message?.includes('Duplicate entry')
                ) {
                    throw new BadRequestException(
                        this.context.i18nService.t('xpert.Error.NameExists', {
                            lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                        })
                    )
                }
            }
            // Re-throw other errors
            throw error
        }
    }

    normalizeApplicationTags(value: unknown): string[] {
        if (!Array.isArray(value)) return []
        return [
            ...new Set(
                value
                    .filter((item): item is string => typeof item === 'string')
                    .map((item) => item.trim())
                    .filter(Boolean)
            )
        ].slice(0, 32)
    }

    validateAndNormalizeMetadataSchema(schema?: KBMetadataFieldDef[] | null): KBMetadataFieldDef[] {
        if (schema == null) return []
        if (!Array.isArray(schema) || schema.length > 100) {
            throw new BadRequestException('Metadata schema must contain at most 100 fields.')
        }
        const allowedTypes = new Set<MetadataFieldType>([
            'string',
            'number',
            'boolean',
            'enum',
            'datetime',
            'string[]',
            'number[]',
            'object'
        ])
        const keys = new Set<string>()
        return schema.map((definition, index) => {
            if (!definition || typeof definition !== 'object') {
                throw new BadRequestException(`Metadata schema field ${index + 1} is invalid.`)
            }
            const key = typeof definition.key === 'string' ? definition.key.trim() : ''
            if (key === 'tableMetadata') {
                throw new BadRequestException(t('server-ai:Error.KnowledgeTableMetadataReservedKey'))
            }
            if (!key || key.length > 128 || !/^[\p{L}\p{N}_-]+$/u.test(key)) {
                throw new BadRequestException(
                    `Metadata field key '${key}' must be 1-128 letters, numbers, underscores or hyphens.`
                )
            }
            if (keys.has(key)) {
                throw new BadRequestException(`Duplicate metadata field key '${key}'.`)
            }
            keys.add(key)
            if (!allowedTypes.has(definition.type)) {
                throw new BadRequestException(`Unsupported metadata type '${definition.type}' for '${key}'.`)
            }
            if (definition.scope !== undefined && !['document', 'chunk'].includes(definition.scope)) {
                throw new BadRequestException(`Unsupported metadata scope '${definition.scope}' for '${key}'.`)
            }
            if (definition.description && definition.description.length > 512) {
                throw new BadRequestException(`Metadata field '${key}' description exceeds 512 characters.`)
            }
            let enumValues: string[] | undefined
            if (definition.type === 'enum') {
                if (!Array.isArray(definition.enumValues) || !definition.enumValues.length) {
                    throw new BadRequestException(`Enum metadata field '${key}' requires enumValues.`)
                }
                if (definition.enumValues.some((value) => typeof value !== 'string')) {
                    throw new BadRequestException(`Enum values for metadata field '${key}' must be strings.`)
                }
                enumValues = [...new Set(definition.enumValues.map((value) => value.trim()))]
                if (
                    enumValues.length > 100 ||
                    enumValues.some((value) => !value || value.length > 512) ||
                    enumValues.length !== definition.enumValues.length
                ) {
                    throw new BadRequestException(`Enum values for metadata field '${key}' are invalid or duplicated.`)
                }
            }
            return {
                ...definition,
                key,
                scope: definition.scope ?? 'document',
                ...(enumValues ? { enumValues } : { enumValues: undefined })
            }
        })
    }

    async assertChunkStructureChange(knowledgebase: Knowledgebase, structure: KnowledgeStructureEnum) {
        if (!Object.values(KnowledgeStructureEnum).includes(structure)) {
            throw invalidKnowledgeParserConfig('structure')
        }
        const documents = await this.context.documentService.findAll({
            where: { knowledgebaseId: knowledgebase.id, type: Not(DocumentTypeEnum.FOLDER) },
            ...(knowledgebase.structure
                ? { take: 1 }
                : { select: { id: true, type: true, category: true, parserConfig: true } })
        })
        if (knowledgebase.structure && documents.total > 0) throw incompatibleKnowledgeChunkStructure()
        // Older single-document imports did not record the KB structure. Check their saved
        // strategies before backfilling it, so defaults never reinterpret existing chunks.
        for (const document of documents.items) {
            const config = resolveKnowledgeDocumentParserConfig(document)
            const existingStructure = config.textSplitterType
                ? await this.context.parserSettings.validateSplitter(config)
                : KnowledgeStructureEnum.General
            if (existingStructure !== structure) throw incompatibleKnowledgeChunkStructure()
        }
    }

    async ensureDocumentChunkStructure(knowledgebaseId: string, structure: KnowledgeStructureEnum) {
        const knowledgebase = await this.context.findOneByIdString(knowledgebaseId)
        if (!knowledgebase.structure) {
            await this.assertChunkStructureChange(knowledgebase, structure)
            // Claim the structure once so concurrent imports cannot install incompatible chunk trees.
            await this.context.repository.update({ id: knowledgebaseId, structure: IsNull() }, { structure })
        }
        const current = knowledgebase.structure ?? (await this.context.findOneByIdString(knowledgebaseId)).structure
        if (current !== structure) throw incompatibleKnowledgeChunkStructure()
    }
}
