import {
    IXpert,
    ModelAccessUnavailableReasonEnum,
    TAssistantModelsResponse,
    TAssistantModelSelectionError,
    TAssistantPrimaryModelSelection,
    TAssistantPrimaryModelSelectionSource,
    TCopilotModel,
    resolveI18nText
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ConfigService } from '@xpert-ai/server-config'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { CatalogModelLabel, ModelAccessService } from '../model-access'
import { applicationMetrics } from '../metrics'
import {
    getAssistantModelId,
    assistantModelCandidates,
    sanitizeAssistantCopilotModel,
    ValidAssistantCopilotModel
} from './assistant-model-selection.util'
import { isAssistantUserSession } from '../shared/assistant-user-session'
import { AssistantUserPreferenceService } from './assistant-user-preference.service'
import { platformFailure } from '../plugin-resource/app-platform/platform-error'

type AssistantModelCandidate = {
    id: string
    model: ValidAssistantCopilotModel
    default: boolean
}

type AssistantModelXpert = Partial<IXpert>

type ResolveSelectionOptions = {
    explicitModelId?: string | null
    continuationModelId?: string | null
    continuationModelSnapshot?: TCopilotModel | null
    continuationSource?: TAssistantPrimaryModelSelectionSource | null
    retryModelId?: string | null
    retryModelSnapshot?: TCopilotModel | null
    ignorePreference?: boolean
}

/**
 * Invariants:
 * - The authored Primary model is always the first candidate and the fallback default.
 * - An explicit run selection never mutates the user's persisted preference.
 * - A stored preference that is no longer selectable is cleared before falling back.
 */
@Injectable()
export class AssistantModelSelectionService {
    constructor(
        private readonly userPreferenceService: AssistantUserPreferenceService,
        private readonly modelAccessService: ModelAccessService,
        private readonly configService: ConfigService
    ) {}

    async getModels(xpert: AssistantModelXpert): Promise<TAssistantModelsResponse> {
        const assistantId = this.requireAssistantId(xpert)
        const preferencePersistable = isAssistantUserSession()
        const candidates = this.getCandidates(xpert).filter((candidate) => preferencePersistable || candidate.default)
        const accessInput = this.getAccessInput(xpert, candidates)
        const [availableIds, labels] = await Promise.all([
            this.getAvailableIds(xpert, candidates, accessInput),
            accessInput ? this.modelAccessService.getCatalogModelLabels(accessInput) : Promise.resolve([])
        ])
        let preference = preferencePersistable
            ? await this.userPreferenceService.getDomain(assistantId, 'modelSelection')
            : null

        if (preference && !availableIds.has(preference.selectedModelId)) {
            await this.userPreferenceService.clearDomain(assistantId, 'modelSelection', preference)
            applicationMetrics.recordInvalidAssistantModelPreference('unavailable')
            preference = null
        }

        const primary = candidates.find((candidate) => candidate.default) ?? null
        const selectedModelId =
            preference?.selectedModelId ?? (primary && availableIds.has(primary.id) ? primary.id : null)

        const language = RequestContext.getLanguageCode()
        return {
            models: candidates.flatMap((candidate, index) => {
                if (!availableIds.has(candidate.id)) return []
                const label = labels[index]
                return [
                    {
                        id: candidate.id,
                        label: resolveI18nText(label?.modelLabel, language) ?? candidate.model.model,
                        description: resolveI18nText(label?.providerLabel, language),
                        ...this.getProviderAvatar(label, accessInput?.organizationId),
                        ...(candidate.default ? { default: true } : {})
                    }
                ]
            }),
            selected_model_id: selectedModelId,
            preference_persistable: preferencePersistable
        }
    }

    async setPreference(xpert: AssistantModelXpert, modelId: string | null): Promise<TAssistantModelsResponse> {
        const assistantId = this.requireAssistantId(xpert)
        if (!isAssistantUserSession()) {
            throw new ForbiddenException(
                t('server-ai:Error.AssistantModelPreferenceForbidden', {
                    defaultValue: 'This authentication principal cannot persist an Assistant model preference.'
                })
            )
        }

        const normalizedModelId = modelId?.trim() || null
        const candidates = this.getCandidates(xpert)
        const primary = candidates.find((candidate) => candidate.default) ?? null

        if (!normalizedModelId) {
            await this.userPreferenceService.clearDomain(assistantId, 'modelSelection')
            return this.getModels(xpert)
        }

        const candidate = candidates.find((item) => item.id === normalizedModelId)
        if (!candidate) {
            throw this.selectionError(normalizedModelId, 'ASSISTANT_MODEL_NOT_ALLOWED')
        }

        const availableIds = await this.getAvailableIds(xpert, [candidate])
        if (!availableIds.has(candidate.id)) {
            throw this.selectionError(candidate.id, 'ASSISTANT_MODEL_UNAVAILABLE')
        }

        if (candidate.id === primary?.id) {
            await this.userPreferenceService.clearDomain(assistantId, 'modelSelection')
        } else {
            await this.userPreferenceService.setDomain(assistantId, 'modelSelection', { selectedModelId: candidate.id })
        }
        return this.getModels(xpert)
    }

    async resolveSelection(
        xpert: AssistantModelXpert,
        options: ResolveSelectionOptions = {}
    ): Promise<TAssistantPrimaryModelSelection> {
        const assistantId = this.requireAssistantId(xpert)
        const candidates = this.getCandidates(xpert)
        const primary = candidates.find((candidate) => candidate.default)
        if (!primary) {
            throw new BadRequestException(
                t('server-ai:Error.AssistantPrimaryModelMissing', {
                    defaultValue: 'The Assistant Primary model is not configured.'
                })
            )
        }

        const resolvePrimary = async (
            source: 'default' | 'explicit' | 'fallback'
        ): Promise<TAssistantPrimaryModelSelection> => {
            await this.assertPrimaryAvailable(xpert, primary)
            return { id: primary.id, model: primary.model, source }
        }
        if (!isAssistantUserSession()) {
            if (options.explicitModelId && options.explicitModelId !== primary.id) {
                throw this.selectionError(options.explicitModelId, 'ASSISTANT_MODEL_NOT_ALLOWED')
            }
            return resolvePrimary('default')
        }

        const continuationModelId = options.continuationModelId?.trim()
        const availableIds = await this.getAvailableIds(xpert, candidates)
        if (continuationModelId) {
            const continued = candidates.find((candidate) => candidate.id === continuationModelId)
            if (continued && availableIds.has(continued.id)) {
                return {
                    id: continued.id,
                    model: this.restoreModel(continued, options.continuationModelSnapshot),
                    source: options.continuationSource ?? 'default'
                }
            }
            return resolvePrimary('fallback')
        }
        const explicitModelId = options.explicitModelId?.trim()
        if (explicitModelId) {
            const explicit = candidates.find((candidate) => candidate.id === explicitModelId)
            if (!explicit) {
                throw this.selectionError(explicitModelId, 'ASSISTANT_MODEL_NOT_ALLOWED')
            }
            if (explicit.id === primary.id) return resolvePrimary('explicit')
            if (!availableIds.has(explicit.id)) {
                throw this.selectionError(explicitModelId, 'ASSISTANT_MODEL_UNAVAILABLE')
            }
            return { id: explicit.id, model: explicit.model, source: 'explicit' }
        }

        const retryModelId = options.retryModelId?.trim()
        if (retryModelId) {
            const retry = candidates.find((candidate) => candidate.id === retryModelId)
            if (retry && availableIds.has(retry.id)) {
                return {
                    id: retry.id,
                    model: this.restoreModel(retry, options.retryModelSnapshot),
                    source: 'retry'
                }
            }
            return resolvePrimary('fallback')
        }

        if (!options.ignorePreference) {
            const preference = await this.userPreferenceService.getDomain(assistantId, 'modelSelection')
            if (preference) {
                const preferred = candidates.find((candidate) => candidate.id === preference.selectedModelId)
                if (preferred && availableIds.has(preferred.id)) {
                    return { id: preferred.id, model: preferred.model, source: 'preference' }
                }
                await this.userPreferenceService.clearDomain(assistantId, 'modelSelection', preference)
                applicationMetrics.recordInvalidAssistantModelPreference('unavailable')
                return resolvePrimary('fallback')
            }
        }

        return resolvePrimary('default')
    }

    private restoreModel(candidate: AssistantModelCandidate, snapshot?: TCopilotModel | null) {
        const model = sanitizeAssistantCopilotModel(snapshot)
        return model && getAssistantModelId(model) === candidate.id ? model : candidate.model
    }

    private async assertPrimaryAvailable(xpert: AssistantModelXpert, primary: AssistantModelCandidate) {
        const input = this.getAccessInput(xpert, [primary])
        if (!input) throw platformFailure('application_primary_model_unavailable', 403)
        const { models, ...scope } = input
        const access = await this.modelAccessService.resolveModelAccess({ ...scope, ...models[0] })
        if (access.unavailableReason === ModelAccessUnavailableReasonEnum.QuotaExhausted)
            throw platformFailure('application_credit_limit', 402)
        if (access.unavailableReason === ModelAccessUnavailableReasonEnum.MembershipRequired)
            throw platformFailure('application_trial_unavailable', 403)
        if (!access.allowed) throw platformFailure('application_primary_model_unavailable', 403)
    }

    private selectionError(modelId: string, code: TAssistantModelSelectionError['code']) {
        const message =
            code === 'ASSISTANT_MODEL_NOT_ALLOWED'
                ? t('server-ai:Error.AssistantModelNotAllowed', {
                      defaultValue: 'The requested model is not allowed by this Assistant.'
                  })
                : t('server-ai:Error.AssistantModelUnavailable', {
                      defaultValue: 'The requested model is not available for this Assistant.'
                  })
        return new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            code,
            modelId,
            message
        } satisfies TAssistantModelSelectionError)
    }

    getModelId(model: Pick<TCopilotModel, 'copilotId' | 'modelType' | 'model'>): string {
        const normalized = sanitizeAssistantCopilotModel(model)
        if (!normalized) {
            throw new BadRequestException(
                t('server-ai:Error.AssistantModelInvalid', {
                    defaultValue: 'A valid LLM model is required to generate an Assistant model id.'
                })
            )
        }
        return getAssistantModelId(normalized)
    }

    private getCandidates(xpert: AssistantModelXpert): AssistantModelCandidate[] {
        return assistantModelCandidates(xpert)
    }

    private async getAvailableIds(
        xpert: AssistantModelXpert,
        candidates: AssistantModelCandidate[],
        accessInput = this.getAccessInput(xpert, candidates)
    ): Promise<Set<string>> {
        if (!accessInput) {
            return new Set()
        }
        const availability = await this.modelAccessService.canUseCatalogModels(accessInput)
        return new Set(candidates.filter((_, index) => availability[index] === true).map((candidate) => candidate.id))
    }

    private getAccessInput(xpert: AssistantModelXpert, candidates: AssistantModelCandidate[]) {
        if (!candidates.length) {
            return null
        }
        const tenantId = xpert.tenantId ?? RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !userId) {
            return null
        }
        return {
            tenantId,
            organizationId: RequestContext.getOrganizationId() ?? xpert.organizationId ?? null,
            userId,
            xpertId: this.requireAssistantId(xpert),
            models: candidates.map((candidate) => ({
                copilotId: candidate.model.copilotId,
                copilotModelId: candidate.model.model,
                modelType: candidate.model.modelType
            }))
        }
    }

    private getProviderAvatar(label: CatalogModelLabel | null | undefined, organizationId?: string | null) {
        if (!label?.provider || !label.providerIconSmall) {
            return null
        }
        const configuredBaseUrl = this.configService.get('baseUrl') as string | undefined
        if (!configuredBaseUrl) {
            return null
        }
        const baseUrl = configuredBaseUrl.endsWith('/') ? configuredBaseUrl : `${configuredBaseUrl}/`
        const language = RequestContext.getLanguageCode()?.toLowerCase().startsWith('zh') ? 'zh_Hans' : 'en_US'
        const organizationQuery = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''

        return {
            avatar: {
                url: `${baseUrl}api/ai-model/provider/${encodeURIComponent(label.provider)}/icon_small/${language}${organizationQuery}`,
                ...(label.providerBackground ? { background: label.providerBackground } : {})
            }
        }
    }

    private requireAssistantId(xpert: AssistantModelXpert): string {
        if (!xpert.id) {
            throw new BadRequestException(
                t('server-ai:Error.AssistantModelIdRequired', {
                    defaultValue: 'Assistant id is required for model selection.'
                })
            )
        }
        return xpert.id
    }
}
