import { IChatMessage, TChatMessageStep } from '@metad/contracts'

export * from './chat-message.module'
export * from './commands/index'

export function appendMessageSteps(aiMessage: IChatMessage, steps: TChatMessageStep[]) {
    aiMessage.steps ??= []
    aiMessage.steps.push(...steps)
}