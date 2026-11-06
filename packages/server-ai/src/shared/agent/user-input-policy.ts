import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

export function canRequestUserInput(context: Pick<IAgentMiddlewareContext, 'supportsUserInput' | 'xpertFeatures'>) {
    return context.supportsUserInput === true && context.xpertFeatures?.requestUserInput?.enabled === true
}
