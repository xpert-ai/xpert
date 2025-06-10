import { IChatMessage, TChatMessageStep } from '@metad/contracts'

export * from './chat-message.module'
export * from './commands/index'

export function appendMessageSteps(aiMessage: IChatMessage, steps: TChatMessageStep[]) {
    aiMessage.steps ??= []
    steps.forEach((item) => {
        if (item.id) {
            const index = aiMessage.steps.findIndex((_) => _.id === item.id)
            if (index > -1) {
                aiMessage.steps[index] = {
                    ...aiMessage.steps[index],
                    ...item
                }
                return
            }
        }
        aiMessage.steps.push(item)
    })
}