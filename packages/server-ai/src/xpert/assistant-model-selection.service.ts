import {
    IXpert,
    SecretTokenBindingType,
    TAssistantModelsResponse,
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
    sanitizeAssistantCopilotModel,
    ValidAssistantCopilotModel
} from './assistant-model-selection.util'
import { AssistantUserPreferenceService } from './assistant-user-preference.service'

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
        const candidates = this.getCandidates(xpert)
        const accessInput = this.getAccessInput(xpert, candidates)
        const [availableIds, labels] = await Promise.all([
            this.getAvailableIds(xpert, candidates, accessInput),
            accessInput ? this.modelAccessService.getCatalogModelLabels(accessInput) : Promise.resolve([])
        ])
        const preferencePersistable = this.isPreferencePersistable()
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

        return {
            models: candidates.map((candidate, index) => ({
                id: candidate.id,
                label:
                    resolveI18nText(labels[index]?.modelLabel, RequestContext.getLanguageCode()) ??
                    candidate.model.model,
                description:
                    resolveI18nText(labels[index]?.providerLabel, RequestContext.getLanguageCode()) ??
                    candidate.model.copilotId,
                ...(this.getProviderAvatar(labels[index], accessInput?.organizationId) ?? {}),
                ...(candidate.default && availableIds.has(candidate.id) ? { default: true } : {}),
                ...(!availableIds.has(candidate.id) ? { disabled: true } : {})
            })),
            selected_model_id: selectedModelId,
            preference_persistable: preferencePersistable
        }
    }

    async setPreference(xpert: AssistantModelXpert, modelId: string | null): Promise<TAssistantModelsResponse> {
        const assistantId = this.requireAssistantId(xpert)
        if (!this.isPreferencePersistable()) {
            throw new ForbiddenException(
                t('server-ai:Error.AssistantModelPreferenceForbidden', {
                    defaultValue: 'This authentication principal cannot persist an Assistant model preference.'
                })
            )
        }

        const normalizedModelId = modelId?.trim() || null
        const candidates = this.getCandidates(xpert)
        const primary = candidates.find((candidate) => candidate.default) ?? null

        if (!normalizedModelId || normalizedModelId === primary?.id) {
            await this.userPreferenceService.clearDomain(assistantId, 'modelSelection')
            return this.getModels(xpert)
        }

        const candidate = candidates.find((item) => item.id === normalizedModelId)
        if (!candidate) {
            throw new BadRequestException(
                t('server-ai:Error.AssistantModelNotAllowed', {
                    defaultValue: 'The requested model is not allowed by this Assistant.'
                })
            )
        }

        const availableIds = await this.getAvailableIds(xpert, [candidate])
        if (!availableIds.has(candidate.id)) {
            throw new BadRequestException(
                t('server-ai:Error.AssistantModelUnavailable', {
                    defaultValue: 'The requested model is not available for the current user.'
                })
            )
        }

        await this.userPreferenceService.setDomain(assistantId, 'modelSelection', {
            selectedModelId: candidate.id
        })
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

        const continuationModelId = options.continuationModelId?.trim()
        if (continuationModelId) {
            const snapshot = sanitizeAssistantCopilotModel(options.continuationModelSnapshot)
            const configured = candidates.find((candidate) => candidate.id === continuationModelId)
            const continuationModel = snapshot ?? configured?.model
            if (continuationModel) {
                return {
                    id: continuationModelId,
                    model: continuationModel,
                    source: options.continuationSource ?? 'default'
                }
            }
        }

        const availableIds = await this.getAvailableIds(xpert, candidates)
        const explicitModelId = options.explicitModelId?.trim()
        if (explicitModelId) {
            const explicit = candidates.find((candidate) => candidate.id === explicitModelId)
            if (!explicit || !availableIds.has(explicit.id)) {
                throw new BadRequestException(
                    t('server-ai:Error.AssistantModelUnavailable', {
                        defaultValue: 'The requested model is not available for this Assistant.'
                    })
                )
            }
            return { id: explicit.id, model: explicit.model, source: 'explicit' }
        }

        const retryModelId = options.retryModelId?.trim()
        if (retryModelId) {
            const retry = candidates.find((candidate) => candidate.id === retryModelId)
            if (retry && availableIds.has(retry.id)) {
                return {
                    id: retry.id,
                    model: options.retryModelSnapshot
                        ? (sanitizeAssistantCopilotModel(options.retryModelSnapshot) ?? retry.model)
                        : retry.model,
                    source: 'retry'
                }
            }
            return { id: primary.id, model: primary.model, source: 'fallback' }
        }

        if (!options.ignorePreference && this.isPreferencePersistable()) {
            const preference = await this.userPreferenceService.getDomain(assistantId, 'modelSelection')
            if (preference) {
                const preferred = candidates.find((candidate) => candidate.id === preference.selectedModelId)
                if (preferred && availableIds.has(preferred.id)) {
                    return { id: preferred.id, model: preferred.model, source: 'preference' }
                }
                await this.userPreferenceService.clearDomain(assistantId, 'modelSelection', preference)
                applicationMetrics.recordInvalidAssistantModelPreference('unavailable')
                return { id: primary.id, model: primary.model, source: 'fallback' }
            }
        }

        return { id: primary.id, model: primary.model, source: 'default' }
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

    isPreferencePersistable(): boolean {
        const principal =
            typeof RequestContext.currentApiPrincipal === 'function' ? RequestContext.currentApiPrincipal() : null
        if (!principal) {
            return Boolean(RequestContext.currentUserId())
        }
        return (
            principal.principalType === 'client_secret' &&
            (principal.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT ||
                principal.clientSecretBindingType === SecretTokenBindingType.ENTERPRISE_XPERT)
        )
    }

    private getCandidates(xpert: AssistantModelXpert): AssistantModelCandidate[] {
        const primaryModel = sanitizeAssistantCopilotModel(xpert.agent?.copilotModel ?? xpert.copilotModel)
        const configuredModels = xpert.options?.modelSelection?.allowedModels ?? []
        const candidates: AssistantModelCandidate[] = []
        const identities = new Set<string>()

        const append = (model: ValidAssistantCopilotModel | null, isDefault: boolean) => {
            if (!model) {
                return
            }
            const id = this.getModelId(model)
            if (identities.has(id)) {
                return
            }
            identities.add(id)
            candidates.push({ id, model, default: isDefault })
        }

        append(primaryModel, true)
        for (const configuredModel of configuredModels) {
            append(sanitizeAssistantCopilotModel(configuredModel), false)
        }
        return candidates
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
