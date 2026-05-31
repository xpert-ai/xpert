import { QueryBus } from '@nestjs/cqrs'
import { ISkillPackage, IXpert, resolveI18nText } from '@xpert-ai/contracts'
import { ListWorkspaceSkillsQuery } from '../../xpert-agent/queries/list-workspace-skills.query'
import {
    getRecommendedRuntimeSkillSelection,
    normalizeStringArray,
    type TRuntimeSkillSelection
} from './runtime-capabilities'
import { AgentStateAnnotation } from './state'

type RuntimeSkillState = {
    selectedSkillIds?: unknown
    selectedSkillWorkspaceId?: unknown
}

function getExplicitRuntimeSkillSelection(
    originalHuman: Partial<typeof AgentStateAnnotation.State>['human'],
    resolvedHuman: Partial<typeof AgentStateAnnotation.State>['human']
): TRuntimeSkillSelection {
    for (const candidate of [resolvedHuman, originalHuman]) {
        const selection = getRecommendedRuntimeSkillSelection(candidate?.runtimeCapabilities)
        if (selection.ids.length) {
            return selection
        }
    }

    return { ids: [] }
}

function getRuntimeSelectedSkillIds(state: Partial<typeof AgentStateAnnotation.State>, explicitSkillIds: string[]) {
    const stateSelectedSkillIds = normalizeStringArray((state as RuntimeSkillState).selectedSkillIds)
    if (!stateSelectedSkillIds.length) {
        return explicitSkillIds
    }

    const enabledSkillIdSet = new Set(stateSelectedSkillIds)
    return explicitSkillIds.filter((skillId) => enabledSkillIdSet.has(skillId))
}

function getRuntimeSelectedSkillWorkspaceId(
    state: Partial<typeof AgentStateAnnotation.State>,
    explicitWorkspaceId?: string,
    xpert?: Pick<IXpert, 'workspaceId'>
) {
    const stateWorkspaceId = (state as RuntimeSkillState).selectedSkillWorkspaceId
    return (
        explicitWorkspaceId ||
        (typeof stateWorkspaceId === 'string' ? stateWorkspaceId.trim() : '') ||
        xpert?.workspaceId ||
        ''
    )
}

function resolveSkillDisplayName(skill: ISkillPackage | undefined, fallbackId: string) {
    const candidates = [
        resolveI18nText(skill?.name),
        skill?.metadata?.name,
        resolveI18nText(skill?.metadata?.displayName),
        skill?.skillIndex?.name,
        skill?.skillIndex?.skillId,
        fallbackId
    ]

    return sanitizePromptLine(
        candidates.find((value): value is string => typeof value === 'string' && !!value.trim()) ?? fallbackId
    )
}

function sanitizePromptLine(value: string) {
    return value.replace(/\s+/g, ' ').trim()
}

async function resolveSelectedRuntimeSkills(
    queryBus: QueryBus,
    workspaceId: string,
    skillIds: string[]
): Promise<Array<{ id: string; name: string }>> {
    let skills: ISkillPackage[] = []
    if (workspaceId) {
        try {
            const result = await queryBus.execute<ListWorkspaceSkillsQuery, ISkillPackage[]>(
                new ListWorkspaceSkillsQuery(workspaceId)
            )
            skills = Array.isArray(result) ? result : []
        } catch {
            skills = []
        }
    }

    const skillById = new Map(skills.map((skill) => [skill.id, skill]))
    return skillIds.map((id) => ({
        id,
        name: resolveSkillDisplayName(skillById.get(id), id)
    }))
}

function formatSelectedRuntimeSkillsPrompt(skills: Array<{ id: string; name: string }>) {
    if (!skills.length) {
        return null
    }

    return [
        '<selected_runtime_skills>',
        'For this request, I selected the following skill(s). If available, please use the matching skill according to its normal instructions:',
        ...skills.map(
            (skill) => `- ${skill.name}${skill.name === skill.id ? '' : ` (id: ${sanitizePromptLine(skill.id)})`}`
        ),
        '</selected_runtime_skills>'
    ].join('\n')
}

export async function buildSelectedRuntimeSkillsPrompt(
    queryBus: QueryBus,
    state: Partial<typeof AgentStateAnnotation.State>,
    originalHuman: Partial<typeof AgentStateAnnotation.State>['human'],
    resolvedHuman: Partial<typeof AgentStateAnnotation.State>['human'],
    xpert?: Pick<IXpert, 'workspaceId'>
) {
    const explicitSelection = getExplicitRuntimeSkillSelection(originalHuman, resolvedHuman)
    const selectedSkillIds = getRuntimeSelectedSkillIds(state, explicitSelection.ids)
    if (!selectedSkillIds.length) {
        return null
    }

    const workspaceId = getRuntimeSelectedSkillWorkspaceId(state, explicitSelection.workspaceId, xpert)
    const skills = await resolveSelectedRuntimeSkills(queryBus, workspaceId, selectedSkillIds)
    return formatSelectedRuntimeSkillsPrompt(skills)
}
