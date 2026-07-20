import { BaseMessage, HumanMessage, isHumanMessage } from '@langchain/core/messages'
import { ICopilotProviderModel, ModelFeature, ProviderModel } from '@xpert-ai/contracts'

const visionSupport = new WeakMap<object, boolean>()
const modelsPreparingOwnMessages = new WeakSet<object>()

export function resolveModelVisionSupport(
    modelName: string,
    customModels: ICopilotProviderModel[] = [],
    providerModels: ProviderModel[] = []
): boolean {
    if (customModels.length) {
        return customModels[0].modelProperties?.vision_support === 'support'
    }
    return providerModels.find((model) => model.model === modelName)?.features?.includes(ModelFeature.VISION) ?? false
}

export function setModelVisionSupport<T extends object>(model: T, supportsVision: boolean): T {
    visionSupport.set(model, supportsVision)
    return model
}

export function setModelPreparesOwnMessages<T extends object>(model: T): T {
    modelsPreparingOwnMessages.add(model)
    return model
}

export function prepareMessagesForModel(messages: BaseMessage[], model: object): BaseMessage[] {
    if (modelsPreparingOwnMessages.has(model) || visionSupport.get(model)) {
        return messages
    }

    return messages.map((message) => {
        if (!isHumanMessage(message) || !Array.isArray(message.content)) {
            return message
        }

        const content = message.content.filter(
            (part) => !(typeof part === 'object' && part !== null && 'type' in part && part.type === 'image_url')
        )
        if (content.length === message.content.length) {
            return message
        }

        return new HumanMessage({
            content,
            name: message.name,
            additional_kwargs: message.additional_kwargs,
            response_metadata: message.response_metadata,
            id: message.id
        })
    })
}
