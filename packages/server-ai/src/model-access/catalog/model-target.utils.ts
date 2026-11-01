import {
    AiModelTypeEnum,
    ModelAccessOwnershipScopeEnum,
    isConfiguredModelAvailable,
    isProviderModelEnabled,
    legacyModelFeatures,
    readModelConfiguration
} from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { AIProvidersService } from '../../ai-model'
import { CopilotProviderModel } from '../../copilot-provider/models/copilot-provider-model.entity'
import { Copilot } from '../../copilot/copilot.entity'
import { usesOrganizationCredentials } from '../../copilot/utils'
import { ModelGatewayPublication } from '../../model-gateway/model-gateway-publication.entity'
import { MembershipFeatureState, ModelTarget, ModelTargetAccessMode, ResolveModelInput } from '../model-access.types'

export function createModelTarget(
    input: Pick<ResolveModelInput, 'tenantId' | 'copilotId' | 'copilotModelId' | 'modelType'>,
    copilot: Copilot,
    provider: ReturnType<AIProvidersService['getProvider']>,
    custom: CopilotProviderModel | null | undefined,
    visibleOrganizationId: string | null
): ModelTarget | null {
    if (!provider || !copilot.modelProvider?.providerName) {
        return null
    }
    const organizationId = copilot.organizationId ?? null
    if (organizationId && organizationId !== visibleOrganizationId) {
        return null
    }
    const providerName = copilot.modelProvider.providerName
    const predefined = provider
        .getProviderModels(input.modelType)
        ?.find((model) => model.model === input.copilotModelId)
    const selectedMatches =
        copilot.copilotModel?.modelType === input.modelType && copilot.copilotModel?.model === input.copilotModelId
    if (!predefined && !custom && !selectedMatches) {
        return null
    }
    const catalogModelExists = Boolean(predefined || custom)
    const providerSchema = provider.getProviderSchema()
    const configuration = readModelConfiguration(custom?.modelProperties)
    return {
        tenantId: input.tenantId,
        organizationId,
        ownershipScope: organizationId
            ? ModelAccessOwnershipScopeEnum.Organization
            : ModelAccessOwnershipScopeEnum.Tenant,
        copilotId: copilot.id,
        copilotModelId: input.copilotModelId,
        copilotName: copilot.name,
        provider: providerName,
        providerLabel: providerSchema?.label,
        providerIconSmall: providerSchema?.icon_small,
        providerBackground: providerSchema?.background,
        modelType: input.modelType,
        model: input.copilotModelId,
        modelLabel: predefined?.label ?? {
            en_US: custom?.modelName ?? input.copilotModelId,
            zh_Hans: custom?.modelName ?? input.copilotModelId
        },
        capabilities:
            configuration?.modelType === AiModelTypeEnum.LLM
                ? configuration.features
                : (predefined?.features ?? legacyModelFeatures(custom?.modelProperties)),
        deprecated: predefined?.deprecated === true,
        enabled:
            isProviderModelEnabled(copilot.modelProvider, {
                model: input.copilotModelId,
                modelType: input.modelType
            }) &&
            catalogModelExists &&
            isConfiguredModelAvailable(copilot.modelProvider, custom) &&
            copilot.enabled === true &&
            copilot.modelProvider.isValid !== false &&
            custom?.isValid !== false &&
            predefined?.deprecated !== true,
        usesOrganizationCredentials: usesOrganizationCredentials(
            copilot,
            organizationId,
            custom,
            providerSchema.model_credential_schema
        )
    }
}

export function resolveTargetAccessMode(
    target: ModelTarget,
    runtimeOrganizationId: string | null,
    membershipFeatures: MembershipFeatureState,
    canManageProviderModels: boolean
): ModelTargetAccessMode {
    if (target.organizationId) {
        if (!membershipFeatures.organizationEnabled) {
            return ModelTargetAccessMode.Direct
        }
        if (
            target.usesOrganizationCredentials &&
            (!membershipFeatures.organizationPlanConfigured || canManageProviderModels)
        ) {
            return ModelTargetAccessMode.Direct
        }
        return ModelTargetAccessMode.Membership
    }
    if (!runtimeOrganizationId) {
        return membershipFeatures.tenantEnabled ? ModelTargetAccessMode.Membership : ModelTargetAccessMode.Direct
    }
    if (membershipFeatures.organizationModelsConfigured) {
        return ModelTargetAccessMode.Blocked
    }
    return membershipFeatures.organizationEnabled || membershipFeatures.tenantEnabled
        ? ModelTargetAccessMode.Membership
        : ModelTargetAccessMode.Blocked
}

export function automaticExternalModelId(target: ModelTarget, used: Set<string>) {
    const provider = externalModelIdPart(target.provider)
    const model = externalModelIdPart(target.model)
    const candidates = [model, `${provider}/${model}`]
    for (const candidate of candidates) {
        if (candidate.length <= 191 && !used.has(candidate)) {
            return candidate
        }
    }
    const suffix = `-${createHash('sha256').update(publicationSourceKey(target)).digest('hex')}`
    return `${provider}/${model}`.slice(0, 191 - suffix.length) + suffix
}

export function externalModelIdPart(value: string) {
    return value.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '') || 'model'
}

export function publicationSourceKey(
    source: Pick<ModelTarget | ModelGatewayPublication, 'copilotId' | 'modelType' | 'copilotModelId'>
) {
    return `${source.copilotId}:${source.modelType}:${source.copilotModelId}`
}
