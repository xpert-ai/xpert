import {
    DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG,
    ICopilotModel,
    IKnowledgebase,
    KNOWLEDGE_WIKI_MAX_CUSTOM_INSTRUCTION_LENGTH,
    KNOWLEDGE_WIKI_SCHEMA_VERSION,
    KnowledgebaseTypeEnum,
    KnowledgebaseWikiConfig,
    normalizeKnowledgebaseWikiConfig,
    ResolvedKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { createHash } from 'node:crypto'

export const KNOWLEDGE_WIKI_GENERATOR_VERSION = 'wiki-v1'

type KnowledgeWikiModelIdentity = Pick<ICopilotModel, 'copilotId' | 'referencedId' | 'modelType' | 'model' | 'options'>

export function createKnowledgeWikiConfigFingerprint(
    config: Partial<KnowledgebaseWikiConfig>,
    effectiveModel?: KnowledgeWikiModelIdentity | null
) {
    const normalizedConfig = normalizeKnowledgebaseWikiConfig(config)
    return createHash('sha256')
        .update(
            stableSerializeKnowledgeWikiValue({
                schemaVersion: KNOWLEDGE_WIKI_SCHEMA_VERSION,
                generatorVersion: KNOWLEDGE_WIKI_GENERATOR_VERSION,
                enabled: normalizedConfig.enabled,
                extractionGranularity: normalizedConfig.extractionGranularity,
                contentGenerationRequirements: normalizedConfig.contentGenerationRequirements,
                extractionFocus: normalizedConfig.extractionFocus,
                effectiveModel: effectiveModel
                    ? {
                          copilotId: effectiveModel.copilotId ?? null,
                          referencedId: effectiveModel.referencedId ?? null,
                          modelType: effectiveModel.modelType ?? null,
                          model: effectiveModel.model ?? null,
                          options: effectiveModel.options ?? null
                      }
                    : null
            })
        )
        .digest('hex')
}

function stableSerializeKnowledgeWikiValue(value: unknown): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value) ?? 'null'
    if (typeof value === 'number') return Number.isFinite(value) ? (JSON.stringify(value) ?? 'null') : 'null'
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerializeKnowledgeWikiValue(item)).join(',')}]`
    }
    if (typeof value === 'object') {
        const entries = Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableSerializeKnowledgeWikiValue(Reflect.get(value, key))}`)
        return `{${entries.join(',')}}`
    }
    return JSON.stringify(String(value))
}

const KNOWLEDGEBASE_WIKI_SERVER_FIELDS = [
    'wikiStatus',
    'wikiAvailability',
    'wikiRevision',
    'wikiActiveRevision',
    'wikiStagedRevision',
    'wikiBuildError',
    'wikiRebuildRequiredReason',
    'wikiGeneratorVersion',
    'wikiConfigFingerprint',
    'canManageWiki'
] as const

export function assertNoClientWikiState(input: Partial<IKnowledgebase>) {
    const field = KNOWLEDGEBASE_WIKI_SERVER_FIELDS.find((name) => Object.prototype.hasOwnProperty.call(input, name))
    if (field) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseWikiStateReadOnly', {
                defaultValue: 'Wiki state is server-controlled and cannot be changed directly',
                field
            })
        )
    }
}

function isKnowledgebaseWikiConfig(value: unknown): value is KnowledgebaseWikiConfig {
    return (
        !!value &&
        typeof value === 'object' &&
        'enabled' in value &&
        typeof value.enabled === 'boolean' &&
        'extractionGranularity' in value &&
        (value.extractionGranularity === 'focused' ||
            value.extractionGranularity === 'standard' ||
            value.extractionGranularity === 'exhaustive') &&
        (!('contentGenerationRequirements' in value) ||
            value.contentGenerationRequirements === undefined ||
            typeof value.contentGenerationRequirements === 'string') &&
        (!('extractionFocus' in value) ||
            value.extractionFocus === undefined ||
            typeof value.extractionFocus === 'string')
    )
}

export function parseKnowledgebaseWikiConfig(value: unknown): ResolvedKnowledgebaseWikiConfig {
    if (!isKnowledgebaseWikiConfig(value)) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseWikiConfigInvalid', {
                defaultValue: 'Wiki configuration is invalid'
            })
        )
    }
    const contentGenerationRequirements = value.contentGenerationRequirements?.trim() ?? ''
    const extractionFocus = value.extractionFocus?.trim() ?? ''
    if (
        contentGenerationRequirements.length > KNOWLEDGE_WIKI_MAX_CUSTOM_INSTRUCTION_LENGTH ||
        extractionFocus.length > KNOWLEDGE_WIKI_MAX_CUSTOM_INSTRUCTION_LENGTH
    ) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseWikiInstructionsTooLong', {
                defaultValue: 'Wiki custom instructions must be 4000 characters or fewer'
            })
        )
    }
    return {
        enabled: value.enabled,
        extractionGranularity: value.extractionGranularity,
        contentGenerationRequirements,
        extractionFocus
    }
}

export function resolveKnowledgeWikiModel(knowledgebase: Pick<Partial<IKnowledgebase>, 'wikiModel' | 'chatModel'>) {
    return knowledgebase.wikiModel ?? knowledgebase.chatModel ?? null
}

export function isUsableKnowledgeWikiModel(
    model: ICopilotModel | null | undefined
): model is ICopilotModel & { copilotId: string; model: string } {
    return !!model?.copilotId && !!model.model
}

type KnowledgeWikiCreateState = Pick<
    IKnowledgebase,
    | 'wikiConfig'
    | 'wikiStatus'
    | 'wikiAvailability'
    | 'wikiRevision'
    | 'wikiActiveRevision'
    | 'wikiStagedRevision'
    | 'wikiBuildError'
    | 'wikiRebuildRequiredReason'
    | 'wikiGeneratorVersion'
    | 'wikiConfigFingerprint'
>

export function prepareKnowledgeWikiCreateState(input: Partial<IKnowledgebase>): KnowledgeWikiCreateState {
    assertNoClientWikiState(input)
    if (input.type !== KnowledgebaseTypeEnum.Standard) {
        if (Object.prototype.hasOwnProperty.call(input, 'wikiConfig')) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiUnsupportedType', {
                    defaultValue: 'Wiki can only be enabled for standard knowledgebases'
                })
            )
        }
        return {}
    }

    const wikiConfig = parseKnowledgebaseWikiConfig(input.wikiConfig ?? DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG)
    const effectiveModel = resolveKnowledgeWikiModel(input)
    if (wikiConfig.enabled && !isUsableKnowledgeWikiModel(effectiveModel)) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseWikiChatModelRequired', {
                defaultValue: 'A chat model is required before Wiki can be enabled'
            })
        )
    }
    return {
        wikiConfig,
        wikiStatus: wikiConfig.enabled ? 'ready' : 'disabled',
        wikiAvailability: wikiConfig.enabled ? 'ready' : 'unavailable',
        wikiRevision: wikiConfig.enabled ? 0 : null,
        wikiActiveRevision: wikiConfig.enabled ? 0 : null,
        wikiStagedRevision: null,
        wikiBuildError: null,
        wikiRebuildRequiredReason: null,
        wikiGeneratorVersion: wikiConfig.enabled ? KNOWLEDGE_WIKI_GENERATOR_VERSION : null,
        wikiConfigFingerprint: wikiConfig.enabled
            ? createKnowledgeWikiConfigFingerprint(wikiConfig, effectiveModel)
            : null
    }
}
