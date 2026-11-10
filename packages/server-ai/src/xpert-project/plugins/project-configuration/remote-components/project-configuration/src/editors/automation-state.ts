import { STATE_VARIABLE_HUMAN, type ProjectConfigurationValues, type ProjectConfigurationValue } from '@xpert-ai/contracts'
const object = (value: ProjectConfigurationValue | undefined): ProjectConfigurationValues => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
export function taskConnectorIds(state: ProjectConfigurationValues): string[] {
    const selection = object(object(object(state[STATE_VARIABLE_HUMAN]).runtimeCapabilities).connectors).bindingIds
    return Array.isArray(selection) ? selection.filter((value): value is string => typeof value === 'string') : []
}
export function withTaskConnectors(state: ProjectConfigurationValues, bindingIds: string[]): ProjectConfigurationValues {
    bindingIds = [...new Set(bindingIds.map((id) => id.trim()).filter(Boolean))]
    const human = object(state[STATE_VARIABLE_HUMAN]), current = object(human.runtimeCapabilities)
    if (!Object.keys(current).length && !bindingIds.length) return state
    if (current.inheritUnselected === true && !bindingIds.length) {
        const { runtimeCapabilities, ...remaining } = human
        return { ...state, [STATE_VARIABLE_HUMAN]: remaining }
    }
    return { ...state, [STATE_VARIABLE_HUMAN]: { ...human, runtimeCapabilities: {
        ...current, mode: 'allowlist', skills: current.skills ?? { ids: [] }, plugins: current.plugins ?? { nodeKeys: [] },
        ...(!Object.keys(current).length ? { inheritUnselected: true } : {}), connectors: { bindingIds }
    } } }
}
