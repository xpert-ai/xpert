import type { IXpert } from '@xpert-ai/contracts'

export const RUNTIME_CAPABILITY_XPERT_RELATIONS = ['agent', 'agent.copilotModel', 'copilotModel']

export type RuntimeCapabilityXpert = Pick<IXpert, 'id' | 'workspaceId' | 'graph' | 'agent' | 'commandProfile'> &
    Partial<Pick<IXpert, 'name' | 'title'>>

export function getRuntimePrimaryAgentKey(xpert: Pick<IXpert, 'agent'>): string | undefined {
    const key = xpert?.agent?.key
    if (typeof key !== 'string') {
        return
    }
    const normalized = key.trim()
    return normalized || undefined
}
