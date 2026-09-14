import { BadRequestException } from '@nestjs/common'
import { KnowledgeAutomaticTaggingConfig } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { normalizeAutomaticTagging, selectTaggingModel } from '../../knowledge-document/tags/automatic-tagging'

/** Store model descriptors only; expanded provider/copilot objects never enter the JSON settings. */
export function prepareAutomaticTaggingConfig(value: unknown): KnowledgeAutomaticTaggingConfig | null {
    if (value == null) return null
    if (typeof value !== 'object' || Array.isArray(value))
        throw new BadRequestException(t('server-ai:Error.KnowledgeTagConfigInvalid'))
    const normalized = normalizeAutomaticTagging(value)
    if ('model' in value && value.model != null && !normalized.model)
        throw new BadRequestException(t('server-ai:Error.KnowledgeTagConfigInvalid'))
    return { ...normalized, model: normalized.model ? selectTaggingModel(normalized) : null }
}
