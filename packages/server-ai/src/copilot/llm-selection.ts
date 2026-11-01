import {
    AiModelTypeEnum,
    DefaultModelRole,
    LegacyProviderRole,
    ICopilotModel,
    ProviderModel
} from '@xpert-ai/contracts'

/** These helpers only consume the current actor's governed LLM catalog. */
export type AvailableLlmCopilot = {
    id?: string | null
    organizationId?: string | null
    role?: LegacyProviderRole | null
    copilotModel?: ICopilotModel | null
    defaultModels?: Partial<Record<DefaultModelRole, ICopilotModel>>
    configuredDefaultRoles?: DefaultModelRole[]
    providerWithModels?: { models?: ProviderModel[] | null } | null
}

type ModelReference = Pick<ICopilotModel, 'copilotId' | 'model' | 'modelType' | 'options'> & {
    copilot?: unknown
}

export type LlmSelection = {
    copilotId: string
    model: string
    modelType: AiModelTypeEnum.LLM
    options?: ICopilotModel['options']
}

export function findAvailableLlmSelection(
    catalog: AvailableLlmCopilot[],
    reference: ModelReference | null | undefined
): LlmSelection | null {
    const copilotId =
        (typeof reference?.copilotId === 'string' ? reference.copilotId.trim() : '') ||
        (typeof reference?.copilot === 'string' ? reference.copilot.trim() : '')
    const model = typeof reference?.model === 'string' ? reference.model.trim() : ''
    if (!copilotId || !model || (reference.modelType && reference.modelType !== AiModelTypeEnum.LLM)) return null
    const available = catalog.some(
        (copilot) =>
            copilot.id === copilotId &&
            copilot.providerWithModels?.models?.some(
                (entry) => entry.model === model && (!entry.model_type || entry.model_type === AiModelTypeEnum.LLM)
            )
    )
    return available
        ? {
              copilotId,
              model,
              modelType: AiModelTypeEnum.LLM,
              ...(reference.options ? { options: structuredClone(reference.options) } : {})
          }
        : null
}

/** Only consume defaults projected by the scoped resolver; absence never means first model. */
export function findDefaultLlmSelection(catalog: AvailableLlmCopilot[]): LlmSelection | null {
    const binding = catalog.find((item) => item.defaultModels?.[DefaultModelRole.Primary])?.defaultModels?.[
        DefaultModelRole.Primary
    ]
    return findAvailableLlmSelection(catalog, binding)
}
