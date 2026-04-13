import { IAssistantBindingToolPreferences } from '@xpert-ai/contracts'

export type TToolPreferenceSourceType = 'toolset' | 'middleware'

const EMPTY_DISABLED_TOOLS: string[] = []
const EMPTY_DISABLED_SKILLS: string[] = []

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

export function getDisabledSkillIds(
    workspaceId: string | null | undefined,
    toolPreferences?: IAssistantBindingToolPreferences | null
): string[] {
    if (!workspaceId || !toolPreferences) {
        return EMPTY_DISABLED_SKILLS
    }

    const source = toolPreferences.skills?.[workspaceId]
    return Array.isArray(source?.disabledSkillIds) ? source.disabledSkillIds : EMPTY_DISABLED_SKILLS
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

export function isUserPreferredSkillEnabled(
    workspaceId: string | null | undefined,
    skillId: string,
    toolPreferences?: IAssistantBindingToolPreferences | null
): boolean {
    return !getDisabledSkillIds(workspaceId, toolPreferences).includes(skillId)
}

export function filterDisabledSkillIds(
    skillIds: string[],
    workspaceId: string | null | undefined,
    toolPreferences?: IAssistantBindingToolPreferences | null
): string[] {
    const disabledSkillIds = getDisabledSkillIds(workspaceId, toolPreferences)
    if (!disabledSkillIds.length) {
        return skillIds
    }

    const disabledSkillIdSet = new Set(disabledSkillIds)
    return skillIds.filter((skillId) => !disabledSkillIdSet.has(skillId))
}
