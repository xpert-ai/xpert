import {
    AI_MODEL_TYPE_VARIABLE,
    CredentialFormTypeEnum,
    ICopilot,
    ICopilotProviderModel,
    ModelCredentialSchema
} from '@xpert-ai/contracts'

export function getCopilotModel(copilot: ICopilot) {
    return copilot.copilotModel?.model || copilot.copilotModel?.referencedModel?.model
}

export function usesOrganizationCredentials(
    copilot: Pick<ICopilot, 'modelProvider'>,
    organizationId?: string | null,
    model?: Pick<ICopilotProviderModel, 'providerId' | 'modelType' | 'modelProperties' | 'isValid'> | null,
    modelCredentialSchema?: ModelCredentialSchema | null
): boolean {
    const provider = copilot.modelProvider
    if (!organizationId || provider?.organizationId !== organizationId || provider.isValid === false) {
        return false
    }
    if (provider.credentials && Object.keys(provider.credentials).length) {
        return true
    }
    if (!provider.id || !model || model.providerId !== provider.id || model.isValid === false) {
        return false
    }

    // Custom models mix credentials with ordinary settings; only active, declared secret fields count.
    return (
        modelCredentialSchema?.credential_form_schemas?.some((field) => {
            const value: unknown = model.modelProperties?.[field.variable]
            if (field.type !== CredentialFormTypeEnum.SECRET_INPUT || typeof value !== 'string' || !value.trim()) {
                return false
            }
            return (
                field.show_on?.every((condition) =>
                    condition.variable === AI_MODEL_TYPE_VARIABLE
                        ? model.modelType === condition.value
                        : model.modelProperties?.[condition.variable] === condition.value
                ) ?? true
            )
        }) ?? false
    )
}
