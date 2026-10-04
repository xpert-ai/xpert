import {
    AiModelTypeEnum,
    AssistantCapabilityConfiguration,
    LanguagesEnum,
    ModelFeature,
    TCopilotModel,
    TXpertTeamDraft,
    TXpertTemplate,
    XpertTemplateSetup,
    resolveI18nText
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AssistantCapabilityProviderRegistry, IAssistantCapabilityProvider } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { stringify } from 'yaml'
import { CopilotWithProviderDto } from '../../copilot/dto'
import { FindCopilotModelsQuery } from '../../copilot/queries'
import {
    capabilityTemplateId,
    parseCapabilityTemplateId,
    parseTemplateCapabilities
} from './template-capability-reference'
import { parseCapabilityTemplateDraft } from './template-draft'
import { recordCapabilityState } from './capability-state'
import { blankAssistantTemplate } from './blank-assistant-template'
import { templateModelOption } from './template-model-option'

@Injectable()
export class AssistantCapabilityService {
    constructor(
        private readonly registry: AssistantCapabilityProviderRegistry,
        private readonly queries: QueryBus
    ) {}

    blankTemplate(): TXpertTemplate {
        return blankAssistantTemplate(this.registry.list().filter((provider) => provider.availableForBlankAssistant))
    }

    configurationTemplate(draft: TXpertTeamDraft): TXpertTemplate {
        const template = this.blankTemplate()
        template.capabilities = this.registry
            .list()
            .filter((provider) => provider.availableForBlankAssistant)
            .map((provider) => ({
                key: provider.key,
                required: provider.isEnabled?.(draft) === true
            }))
        template.export_data = stringify(draft)
        return template
    }

    async configurationOptions(
        template: TXpertTemplate,
        draft: TXpertTeamDraft,
        language: LanguagesEnum,
        sandboxProviders: { type: string }[]
    ): Promise<AssistantCapabilityConfiguration['options']> {
        const declarations = new Map(template.capabilities?.map((item) => [item.key, item]))
        return Promise.all(
            this.registry
                .list()
                .filter((provider) => declarations.has(provider.key))
                .map(async (provider) => {
                    const availability = await provider.check({ template, draft, language, sandboxProviders })
                    return {
                        key: provider.key,
                        label: resolveI18nText(provider.label, RequestContext.getLanguageCode()) || provider.key,
                        description: resolveI18nText(provider.description, RequestContext.getLanguageCode()) || '',
                        required: declarations.get(provider.key).required === true,
                        ...availability
                    }
                })
        )
    }

    async setup(
        template: TXpertTemplate,
        language: LanguagesEnum,
        selected: string[] = [],
        sandboxProviders?: { type: string }[],
        installationDraft?: TXpertTeamDraft
    ): Promise<XpertTemplateSetup> {
        const { active, options } = this.resolve(template, selected)
        const result: XpertTemplateSetup = {
            optionalCapabilities: options,
            requiredModelFeatures: [...new Set(active.flatMap((provider) => provider.requiredModelFeatures ?? []))],
            models: [],
            canInstall: true
        }
        result.requiresModel = template.requiresModelSelection === true || result.requiredModelFeatures.length > 0
        if (!active.length && !result.requiresModel) return result
        if (!RequestContext.currentTenantId() || !RequestContext.getOrganizationId()) {
            throw new BadRequestException(t('server-ai:Error.TemplateCapabilityOrganizationRequired'))
        }
        const draft = installationDraft ?? parseCapabilityTemplateDraft(template.export_data)
        for (const provider of active) {
            const availability = await provider.check({ template, draft, language, sandboxProviders })
            if (!availability.available)
                return {
                    ...result,
                    canInstall: false,
                    reason:
                        availability.reason ??
                        t('server-ai:Error.TemplateCapabilityUnavailable', { capability: provider.key })
                }
        }
        if (!result.requiresModel) return result
        const copilots = await this.queries.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM)
        )
        result.models = copilots.flatMap((copilot) =>
            copilot.providerWithModels.models
                .filter((model) =>
                    result.requiredModelFeatures.every(
                        (feature) =>
                            model.features?.includes(feature) ||
                            (feature === ModelFeature.TOOL_CALL &&
                                model.features?.includes(ModelFeature.MULTI_TOOL_CALL))
                    )
                )
                .map((model) => templateModelOption(copilot, model, RequestContext.getLanguageCode()))
        )
        return result.models.length
            ? result
            : { ...result, canInstall: false, reason: t('server-ai:Error.TemplateCapabilityModelRequired') }
    }

    async prepareInstallation(
        template: TXpertTemplate,
        draft: TXpertTeamDraft,
        language: LanguagesEnum,
        selected: string[],
        model: TCopilotModel | undefined,
        sandboxProviders: { type: string }[]
    ) {
        // Re-query runtime and governed models immediately before import. Never trust the UI preflight.
        const check = await this.setup(template, language, selected, sandboxProviders, draft)
        if (!check.canInstall) throw new BadRequestException(check.reason)
        if (!check.requiresModel) return
        const choice = check.models.find(
            (item) =>
                item.copilotModel.copilotId === model?.copilotId &&
                item.copilotModel.model === model?.model &&
                model?.modelType === AiModelTypeEnum.LLM
        )
        if (!choice) throw new BadRequestException(t('server-ai:Error.TemplateCapabilityModelRequired'))
        draft.team.copilotModel = choice.copilotModel
        const primary = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
        if (primary?.type === 'agent') primary.entity.copilotModel = null
    }

    async compose(
        template: TXpertTemplate,
        language: LanguagesEnum,
        selected: string[],
        loadTemplate: (id: string) => Promise<TXpertTemplate>
    ): Promise<TXpertTemplate> {
        const { active } = this.resolve(template, selected)
        if (!active.length && !template.requiresModelSelection) return template
        const draft = parseCapabilityTemplateDraft(template.export_data)
        const before = structuredClone(draft)
        for (const provider of active) await provider.apply({ template, draft, language, loadTemplate })
        recordCapabilityState(before, draft, selected)
        const id = capabilityTemplateId(template.id, selected)
        return {
            ...template,
            id,
            key: id,
            enabledCapabilities: active.map(({ key }) => key),
            export_data: stringify(draft),
            contentHash: undefined
        }
    }

    private resolve(template: TXpertTemplate, selected: string[]) {
        const providers = new Map(this.registry.list().map((provider) => [provider.key, provider]))
        const reference = parseCapabilityTemplateId(template.id)
        const templateId = reference?.templateId ?? template.id
        const requested = parseTemplateCapabilities([...selected, ...(reference?.capabilities ?? [])])
        const declarations = new Map((template.capabilities ?? []).map((entry) => [entry.key, entry.required === true]))
        for (const provider of providers.values()) {
            const entry = provider.templates?.find((entry) => entry.templateId === templateId)
            if (entry) declarations.set(provider.key, entry.required || declarations.get(provider.key) === true)
        }
        for (const key of requested) {
            if (!declarations.has(key))
                throw new BadRequestException(t('server-ai:Error.TemplateCapabilityNotSupported'))
        }
        const active: IAssistantCapabilityProvider[] = []
        const options: XpertTemplateSetup['optionalCapabilities'] = []
        for (const [key, required] of [...declarations].sort(([a], [b]) => a.localeCompare(b))) {
            const provider = providers.get(key)
            if (!provider) {
                if (required || requested.includes(key))
                    throw new BadRequestException(
                        t('server-ai:Error.TemplateCapabilityUnavailable', { capability: key })
                    )
                continue
            }
            if (!required)
                options.push({
                    key,
                    label: resolveI18nText(provider.label, RequestContext.getLanguageCode()) || key,
                    description: resolveI18nText(provider.description, RequestContext.getLanguageCode()) || ''
                })
            if (required || requested.includes(key)) active.push(provider)
        }
        return { active, options }
    }
}
