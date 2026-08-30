import { createHash } from 'node:crypto'
import { AiModelTypeEnum, TCopilotModel } from '@xpert-ai/contracts'

export type ValidAssistantCopilotModel = TCopilotModel & {
    copilotId: string
    model: string
    modelType: AiModelTypeEnum.LLM
}

export function sanitizeAssistantCopilotModel(model?: TCopilotModel | null): ValidAssistantCopilotModel | null {
    const copilotId = model?.copilotId?.trim()
    const modelName = model?.model?.trim()
    const modelType = model?.modelType ?? AiModelTypeEnum.LLM
    if (!copilotId || !modelName || modelType !== AiModelTypeEnum.LLM) {
        return null
    }
    return {
        copilotId,
        model: modelName,
        modelType,
        ...(model?.options ? { options: { ...model.options } } : {})
    }
}

export function getAssistantModelId(
    model: Pick<ValidAssistantCopilotModel, 'copilotId' | 'modelType' | 'model'>
): string {
    const identity = [model.copilotId, model.modelType, model.model].join('\u0000')
    return `mdl_${createHash('sha256').update(identity).digest('base64url')}`
}

export function normalizeAssistantAllowedModels(
    primaryModel: TCopilotModel | null | undefined,
    allowedModels: TCopilotModel[]
): ValidAssistantCopilotModel[] {
    const primary = sanitizeAssistantCopilotModel(primaryModel)
    const primaryId = primary ? getAssistantModelId(primary) : null
    const seen = new Set<string>()
    const normalized: ValidAssistantCopilotModel[] = []

    for (const model of allowedModels) {
        const candidate = sanitizeAssistantCopilotModel(model)
        if (!candidate) {
            continue
        }
        const id = getAssistantModelId(candidate)
        if (id === primaryId || seen.has(id)) {
            continue
        }
        seen.add(id)
        normalized.push(candidate)
    }
    return normalized
}

/** Remove provider credentials while retaining runtime tuning parameters for audit/retry. */
export function sanitizeAssistantModelSnapshot(model: TCopilotModel): ValidAssistantCopilotModel {
    const normalized = sanitizeAssistantCopilotModel(model)
    if (!normalized) {
        throw new Error('Cannot snapshot an invalid Assistant LLM model.')
    }
    return {
        ...normalized,
        ...(normalized.options ? { options: scrubSensitiveModelOptions(normalized.options) } : {})
    }
}

function scrubSensitiveModelOptions(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => {
            if (/(api[-_]?key|token|secret|password|credential|authorization)/i.test(key)) {
                return []
            }
            return [[key, scrubSensitiveModelOptionValue(item)]]
        })
    )
}

function scrubSensitiveModelOptionValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => scrubSensitiveModelOptionValue(item))
    }
    if (value && typeof value === 'object') {
        return scrubSensitiveModelOptions(value as Record<string, unknown>)
    }
    return value
}
