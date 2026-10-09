import type { IXpert } from '@xpert-ai/contracts'

export const RUNTIME_CAPABILITY_XPERT_RELATIONS = ['agent', 'agent.copilotModel', 'copilotModel']

export function getRuntimePrimaryAgentKey(xpert: IXpert): string | undefined {
    const key = xpert?.agent?.key
    if (typeof key !== 'string') {
        return
    }
    const normalized = key.trim()
    return normalized || undefined
}
