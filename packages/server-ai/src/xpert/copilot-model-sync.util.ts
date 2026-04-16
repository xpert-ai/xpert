import {
    AiModelTypeEnum,
    ICopilotModel,
    IXpertAgent,
    ModelFeature,
    ProviderModel,
    TXpertTeamDraft,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'

type AvailableCopilotModelSource = {
    id?: string | null
    providerWithModels?: {
        models?: ProviderModel[] | null
    } | null
}

type AvailableLlmModelItem = {
    copilotId: string
    model: string
    modelType: AiModelTypeEnum.LLM
    features: ModelFeature[]
}

type ResolvedTeamLlmSelection = {
    copilotId: string
    model: string
    modelType: AiModelTypeEnum.LLM
    options?: ICopilotModel['options'] | null
    features: ModelFeature[]
}

type ModelScanContext = {
    nodeType?: string
    workflowEntityType?: WorkflowNodeTypeEnum | string
}

type DraftObject = {
    [key: string]: unknown
}

const isDraftObject = (value: unknown): value is DraftObject =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const cloneValue = <T>(value: T): T => (value == null ? value : structuredClone(value))

function isModelConfigShape(value: DraftObject | null) {
    if (!value) {
        return false
    }

    return (
        Object.prototype.hasOwnProperty.call(value, 'model') ||
        Object.prototype.hasOwnProperty.call(value, 'copilotId') ||
        Object.prototype.hasOwnProperty.call(value, 'copilot') ||
        Object.prototype.hasOwnProperty.call(value, 'modelType') ||
        Object.prototype.hasOwnProperty.call(value, 'options')
    )
}

function collectAvailableLlmModelItems(copilots: AvailableCopilotModelSource[]): AvailableLlmModelItem[] {
    const items = copilots.flatMap((copilot) => {
        const copilotId = readString(copilot?.id)
        if (!copilotId) {
            return []
        }

        return (copilot?.providerWithModels?.models ?? [])
            .map((model): AvailableLlmModelItem | null => {
                const modelId = readString(model?.model)
                const modelType = model?.model_type ?? AiModelTypeEnum.LLM
                if (!modelId || modelType !== AiModelTypeEnum.LLM) {
                    return null
                }

                return {
                    copilotId,
                    model: modelId,
                    modelType: AiModelTypeEnum.LLM,
                    features: ((model?.features as ModelFeature[] | undefined) ?? []).filter(Boolean)
                }
            })
            .filter((item): item is AvailableLlmModelItem => Boolean(item))
    })

    return items.filter(
        (item, index, list) =>
            list.findIndex(
                (candidate) =>
                    candidate.copilotId === item.copilotId &&
                    candidate.model === item.model &&
                    candidate.modelType === item.modelType
            ) === index
    )
}

function readCopilotId(config: { copilotId?: unknown; copilot?: unknown } | null | undefined) {
    return readString(config?.copilotId) || readString(config?.copilot)
}

function getAvailableItemsForTarget(
    items: AvailableLlmModelItem[],
    modelType: AiModelTypeEnum,
    requiredFeatures: ModelFeature[]
) {
    if (modelType !== AiModelTypeEnum.LLM) {
        return []
    }

    return items.filter((item) => requiredFeatures.every((feature) => item.features.includes(feature)))
}

function resolveTeamLlmSelection(
    copilotModel: ICopilotModel | null | undefined,
    items: AvailableLlmModelItem[]
): ResolvedTeamLlmSelection | null {
    const copilotId = readCopilotId(copilotModel)
    const model = readString(copilotModel?.model)
    const rawModelType = readString(copilotModel?.modelType)
    const modelType = rawModelType ? (rawModelType as AiModelTypeEnum) : AiModelTypeEnum.LLM

    if (!copilotId || !model || modelType !== AiModelTypeEnum.LLM) {
        return null
    }

    const matched = items.find((item) => item.copilotId === copilotId && item.model === model)
    if (!matched) {
        return null
    }

    return {
        copilotId: matched.copilotId,
        model: matched.model,
        modelType: AiModelTypeEnum.LLM,
        options: cloneValue(copilotModel?.options ?? null),
        features: matched.features
    }
}

function extendModelScanContext(
    record: DraftObject,
    key: string,
    child: DraftObject | null,
    context: ModelScanContext
): ModelScanContext {
    if (key === 'entity' && child) {
        return {
            ...context,
            nodeType: readString(record['type']) || context.nodeType,
            workflowEntityType: readString(child['type']) || context.workflowEntityType
        }
    }

    return context
}

function inferTargetModelType(
    label: string,
    key: string,
    context: ModelScanContext,
    value: DraftObject | null
): AiModelTypeEnum {
    const explicitModelType = readString(value?.['modelType'])
    if (explicitModelType) {
        return explicitModelType as AiModelTypeEnum
    }

    if (key === 'rerankModel') {
        return AiModelTypeEnum.RERANK
    }

    if (key === 'embeddingModel') {
        return AiModelTypeEnum.TEXT_EMBEDDING
    }

    if (label.includes('speechToText.copilotModel')) {
        return AiModelTypeEnum.SPEECH2TEXT
    }

    if (label.includes('textToSpeech.copilotModel')) {
        return AiModelTypeEnum.TTS
    }

    if (
        key === 'copilotModel' &&
        (context.nodeType === 'knowledge' ||
            context.workflowEntityType === WorkflowNodeTypeEnum.KNOWLEDGE_BASE ||
            context.workflowEntityType === 'knowledge-base' ||
            label.includes('knowledgebases['))
    ) {
        return AiModelTypeEnum.TEXT_EMBEDDING
    }

    return AiModelTypeEnum.LLM
}

function inferTargetFeatures(key: string) {
    return key === 'visionModel' ? [ModelFeature.VISION] : []
}

function shouldTreatAsModelTarget(key: string, child: unknown, context: ModelScanContext) {
    if (key === 'model') {
        if (child == null) {
            return context.workflowEntityType === WorkflowNodeTypeEnum.MIDDLEWARE
        }

        return (
            isDraftObject(child) &&
            (context.workflowEntityType === WorkflowNodeTypeEnum.MIDDLEWARE || isModelConfigShape(child))
        )
    }

    return key.endsWith('Model')
}

function hasValidLlmCopilotId(
    config: { copilotId?: unknown; copilot?: unknown; model?: unknown } | null,
    items: AvailableLlmModelItem[],
    targetModelType: AiModelTypeEnum,
    requiredFeatures: ModelFeature[]
) {
    if (!config) {
        return false
    }

    const copilotId = readCopilotId(config)
    const model = readString(config.model)
    if (!copilotId || !model) {
        return false
    }

    const availableItems = getAvailableItemsForTarget(items, targetModelType, requiredFeatures)
    return availableItems.some((item) => item.copilotId === copilotId && item.model === model)
}

function buildSynchronizedModelConfig(currentConfig: DraftObject | null, selection: ResolvedTeamLlmSelection) {
    const nextConfig: DraftObject = {
        ...(currentConfig ?? {}),
        copilotId: selection.copilotId,
        modelType: selection.modelType,
        model: selection.model
    }

    delete nextConfig['copilot']

    if ((!currentConfig || currentConfig['options'] == null) && selection.options != null) {
        nextConfig['options'] = cloneValue(selection.options)
    }

    return nextConfig
}

export function syncPrimaryAgentModelWithTeamSelection(
    entity: { copilotModel?: ICopilotModel | null; agent?: Partial<IXpertAgent> | null },
    copilots: AvailableCopilotModelSource[]
) {
    if (!entity?.agent) {
        return false
    }

    const availableItems = collectAvailableLlmModelItems(copilots)
    const teamSelection = resolveTeamLlmSelection(entity.copilotModel, availableItems)
    if (!teamSelection) {
        return false
    }

    const currentConfig = isDraftObject(entity.agent.copilotModel) ? entity.agent.copilotModel : null
    if (hasValidLlmCopilotId(currentConfig, availableItems, AiModelTypeEnum.LLM, [])) {
        return false
    }

    entity.agent.copilotModel = buildSynchronizedModelConfig(currentConfig, teamSelection) as ICopilotModel
    return true
}

export function syncDraftLlmModelConfigsWithTeamSelection(
    draft: TXpertTeamDraft,
    copilots: AvailableCopilotModelSource[]
) {
    const availableItems = collectAvailableLlmModelItems(copilots)
    const teamSelection = resolveTeamLlmSelection(draft?.team?.copilotModel, availableItems)
    if (!teamSelection) {
        return false
    }

    let changed = false

    const visit = (value: unknown, path: string, context: ModelScanContext) => {
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${path}[${index}]`, context))
            return
        }

        if (!isDraftObject(value)) {
            return
        }

        for (const [key, child] of Object.entries(value)) {
            const childPath = path ? `${path}.${key}` : key
            const childRecord = isDraftObject(child) ? child : null
            const childContext = extendModelScanContext(value, key, childRecord, context)

            if (shouldTreatAsModelTarget(key, child, childContext)) {
                const modelType = inferTargetModelType(childPath, key, childContext, childRecord)
                const requiredFeatures = inferTargetFeatures(key)

                if (
                    modelType === AiModelTypeEnum.LLM &&
                    requiredFeatures.every((feature) => teamSelection.features.includes(feature)) &&
                    !hasValidLlmCopilotId(childRecord, availableItems, modelType, requiredFeatures)
                ) {
                    value[key] = buildSynchronizedModelConfig(childRecord, teamSelection)
                    changed = true
                }
            }

            visit(value[key], childPath, childContext)
        }
    }

    visit(draft, '', {})
    return changed
}
