import { IAssistantBindingToolPreferences } from '@metad/contracts'

export type TToolPreferenceSourceType = 'toolset' | 'middleware'

const EMPTY_DISABLED_TOOLS: string[] = []

function getDisabledTools(
    sourceType: TToolPreferenceSourceType,
    nodeKey: string | null | undefined,
    toolPreferences?: IAssistantBindingToolPreferences | null
): string[] {
    if (!nodeKey || !toolPreferences) {
        return EMPTY_DISABLED_TOOLS
    }

    const source =
        sourceType === 'toolset'
            ? toolPreferences.toolsets?.[nodeKey]
            : toolPreferences.middlewares?.[nodeKey]

    return Array.isArray(source?.disabledTools) ? source.disabledTools : EMPTY_DISABLED_TOOLS
}

export function isUserPreferredToolEnabled(
    sourceType: TToolPreferenceSourceType,
    nodeKey: string | null | undefined,
    toolName: string,
    toolPreferences?: IAssistantBindingToolPreferences | null
): boolean {
    return !getDisabledTools(sourceType, nodeKey, toolPreferences).includes(toolName)
}

export function filterDisabledTools<T extends { name: string }>(
    tools: T[],
    sourceType: TToolPreferenceSourceType,
    nodeKey: string | null | undefined,
    toolPreferences?: IAssistantBindingToolPreferences | null
): T[] {
    const disabledTools = getDisabledTools(sourceType, nodeKey, toolPreferences)
    if (!disabledTools.length) {
        return tools
    }

    const disabledToolSet = new Set(disabledTools)
    return tools.filter((tool) => !disabledToolSet.has(tool.name))
}
