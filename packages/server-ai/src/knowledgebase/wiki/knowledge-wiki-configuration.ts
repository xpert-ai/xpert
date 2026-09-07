import {
    ICopilotModel,
    IKnowledgebase,
    KnowledgebaseWikiConfig,
    KnowledgebaseTypeEnum,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    createKnowledgeWikiConfigFingerprint,
    isUsableKnowledgeWikiModel,
    KNOWLEDGE_WIKI_GENERATOR_VERSION,
    parseKnowledgebaseWikiConfig,
    resolveKnowledgeWikiModel
} from './knowledge-wiki-config'

export type KnowledgeWikiConfigurationUpdate = {
    wikiConfig: KnowledgebaseWikiConfig
    wikiModel?: ICopilotModel | null
    settings?: Partial<IKnowledgebase>
    confirmModelCharges?: boolean
    maxModelInvocations?: number
    maxEstimatedTokens?: number
}

// Validate the complete draft before either ordinary settings or Wiki state is persisted.
export function prepareKnowledgeWikiConfiguration(
    current: Knowledgebase,
    input: KnowledgeWikiConfigurationUpdate,
    chatModel: Knowledgebase['chatModel'] = current.chatModel
): Partial<Knowledgebase> {
    const knowledgebase = Object.assign(new Knowledgebase(), current, { chatModel })
    if (knowledgebase.type !== KnowledgebaseTypeEnum.Standard) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseWikiUnsupportedType', {
                defaultValue: 'Wiki can only be enabled for standard knowledgebases'
            })
        )
    }

    const wikiConfig = parseKnowledgebaseWikiConfig(input.wikiConfig)
    const currentConfig = normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
    const hasDocuments = (knowledgebase.documentNum ?? 0) > 0
    if (hasDocuments && wikiConfig.enabled !== currentConfig.enabled) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseIndexStrategyLocked', {
                defaultValue:
                    'This knowledge base already contains content. Its indexing strategy cannot be changed yet. Clear the knowledge base before changing it.'
            })
        )
    }
    const hasWikiModel = Object.prototype.hasOwnProperty.call(input, 'wikiModel')
    const wikiModel = hasWikiModel ? (input.wikiModel ?? null) : (knowledgebase.wikiModel ?? null)
    const effectiveModel = resolveKnowledgeWikiModel({
        wikiModel,
        chatModel: knowledgebase.chatModel
    })
    if (wikiConfig.enabled && !isUsableKnowledgeWikiModel(effectiveModel)) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseWikiChatModelRequired', {
                defaultValue: 'A Wiki model or general LLM is required before Wiki can be enabled'
            })
        )
    }

    const currentFingerprint = knowledgebase.wikiConfigFingerprint ?? null
    const targetFingerprint = wikiConfig.enabled
        ? createKnowledgeWikiConfigFingerprint(wikiConfig, effectiveModel)
        : null
    const requiresPaidRebuild =
        hasDocuments && wikiConfig.enabled && (!currentConfig.enabled || currentFingerprint !== targetFingerprint)
    if (requiresPaidRebuild && input.confirmModelCharges !== true) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseWikiRebuildChargeConfirmationRequired', {
                defaultValue: 'Confirm model charges before changing Wiki generation for a non-empty knowledgebase'
            })
        )
    }

    knowledgebase.wikiConfig = wikiConfig
    knowledgebase.wikiModel = wikiModel
    knowledgebase.wikiModelId = wikiModel?.id ?? null
    knowledgebase.wikiBuildError = null
    knowledgebase.wikiStagedRevision = null

    if (!wikiConfig.enabled) {
        knowledgebase.wikiStatus = 'disabled'
        knowledgebase.wikiAvailability = 'unavailable'
        knowledgebase.wikiRebuildRequiredReason = null
        knowledgebase.wikiGeneratorVersion = null
        knowledgebase.wikiConfigFingerprint = null
    } else if (!hasDocuments) {
        knowledgebase.wikiStatus = 'ready'
        knowledgebase.wikiAvailability = 'ready'
        knowledgebase.wikiRevision ??= 0
        knowledgebase.wikiActiveRevision ??= 0
        knowledgebase.wikiRebuildRequiredReason = null
        knowledgebase.wikiGeneratorVersion = KNOWLEDGE_WIKI_GENERATOR_VERSION
        knowledgebase.wikiConfigFingerprint = targetFingerprint
    } else if (!currentConfig.enabled || currentFingerprint !== targetFingerprint) {
        knowledgebase.wikiStatus = 'rebuild_required'
        knowledgebase.wikiAvailability = knowledgebase.wikiActiveRevision ? 'ready' : 'unavailable'
        knowledgebase.wikiRebuildRequiredReason = null
        if (!currentConfig.enabled) {
            knowledgebase.wikiConfigFingerprint = null
        }
    }
    return {
        wikiConfig: knowledgebase.wikiConfig,
        wikiModel: knowledgebase.wikiModel,
        wikiModelId: knowledgebase.wikiModelId,
        wikiBuildError: knowledgebase.wikiBuildError,
        wikiStagedRevision: knowledgebase.wikiStagedRevision,
        wikiStatus: knowledgebase.wikiStatus,
        wikiAvailability: knowledgebase.wikiAvailability,
        wikiRebuildRequiredReason: knowledgebase.wikiRebuildRequiredReason,
        wikiGeneratorVersion: knowledgebase.wikiGeneratorVersion,
        wikiConfigFingerprint: knowledgebase.wikiConfigFingerprint,
        wikiRevision: knowledgebase.wikiRevision,
        wikiActiveRevision: knowledgebase.wikiActiveRevision
    }
}
