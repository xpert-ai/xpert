import { IChatMessage, TChatMessageStep } from '@metad/contracts'

export * from './chat-message.module'
export * from './commands/index'

export function appendMessageSteps(aiMessage: IChatMessage, steps: TChatMessageStep[]) {
    aiMessage.events ??= []
    steps.forEach((item) => {
        if (item.id) {
            const index = aiMessage.events.findIndex((_) => _.id === item.id)
            if (index > -1) {
                aiMessage.events[index] = {
                    ...aiMessage.events[index],
                    ...item
                }
                return
            }
        }
        aiMessage.events.push(item)
    })
}