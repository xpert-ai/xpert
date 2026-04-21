import {
    AssistantBindingToolPreferenceSourceType,
    filterAssistantBindingDisabledSkillIds,
    filterAssistantBindingDisabledTools,
    getAssistantBindingDisabledSkillIds,
    isAssistantBindingSkillEnabled,
    isAssistantBindingToolEnabled,
    IAssistantBindingToolPreferences
} from '@xpert-ai/contracts'

export type TToolPreferenceSourceType = AssistantBindingToolPreferenceSourceType

export function getDisabledSkillIds(
    workspaceId: string | null | undefined,
    toolPreferences?: IAssistantBindingToolPreferences | null
): string[] {
    return getAssistantBindingDisabledSkillIds(toolPreferences, workspaceId)
}

export function isUserPreferredToolEnabled(
    sourceType: TToolPreferenceSourceType,
    nodeKey: string | null | undefined,
    toolName: string,
    toolPreferences?: IAssistantBindingToolPreferences | null
): boolean {
    return isAssistantBindingToolEnabled(toolPreferences, sourceType, nodeKey, toolName)
}

export function filterDisabledTools<T extends { name: string }>(
    tools: T[],
    sourceType: TToolPreferenceSourceType,
    nodeKey: string | null | undefined,
    toolPreferences?: IAssistantBindingToolPreferences | null
): T[] {
    return filterAssistantBindingDisabledTools(tools, toolPreferences, sourceType, nodeKey)
}

export function isUserPreferredSkillEnabled(
    workspaceId: string | null | undefined,
    skillId: string,
    toolPreferences?: IAssistantBindingToolPreferences | null
): boolean {
    return isAssistantBindingSkillEnabled(toolPreferences, workspaceId, skillId)
}

export function filterDisabledSkillIds(
    skillIds: string[],
    workspaceId: string | null | undefined,
    toolPreferences?: IAssistantBindingToolPreferences | null
): string[] {
    return filterAssistantBindingDisabledSkillIds(skillIds, toolPreferences, workspaceId)
}
