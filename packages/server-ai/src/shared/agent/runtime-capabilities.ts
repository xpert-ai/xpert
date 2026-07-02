import type { RuntimeCapabilitiesSelection, RuntimeCapabilitiesSelectionSet } from '@xpert-ai/chatkit-types'
import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'

export const RUNTIME_CAPABILITIES_HUMAN_INPUT_KEY = 'runtimeCapabilities'

export type TRuntimeCapabilitiesSelection = RuntimeCapabilitiesSelection
export type TRuntimeCapabilitiesSelectionSet = RuntimeCapabilitiesSelectionSet
export type TRuntimeCapabilitiesSelectionWithRecommended = RuntimeCapabilitiesSelection

export type TRuntimeSkillSelection = {
    workspaceId?: string
    ids: string[]
}

export function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }

    const seen = new Set<string>()
    const result: string[] = []
    for (const item of value) {
        if (typeof item !== 'string') {
            continue
        }
        const normalized = item.trim()
        if (!normalized || seen.has(normalized)) {
            continue
        }
        seen.add(normalized)
        result.push(normalized)
    }
    return result
}

type RuntimeCapabilitiesSelectionCandidate = {
    mode?: unknown
    skills?: unknown
    plugins?: unknown
    subAgents?: unknown
    recommended?: unknown
}

type RuntimeCapabilitiesSelectionSetCandidate = {
    skills?: unknown
    plugins?: unknown
    subAgents?: unknown
}

type SkillSelectionCandidate = {
    workspaceId?: unknown
    ids?: unknown
}

type NodeKeySelectionCandidate = {
    nodeKeys?: unknown
}

type ChatStateCandidate = {
    [STATE_VARIABLE_HUMAN]?: unknown
}

type HumanStateCandidate = {
    [RUNTIME_CAPABILITIES_HUMAN_INPUT_KEY]?: unknown
}

function isObjectValue(value: unknown): value is object {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toSelectionCandidate(value: unknown): RuntimeCapabilitiesSelectionCandidate | null {
    return isObjectValue(value) ? (value as RuntimeCapabilitiesSelectionCandidate) : null
}

function toSelectionSetCandidate(value: unknown): RuntimeCapabilitiesSelectionSetCandidate | null {
    return isObjectValue(value) ? (value as RuntimeCapabilitiesSelectionSetCandidate) : null
}

function toSkillSelectionCandidate(value: unknown): SkillSelectionCandidate | null {
    return isObjectValue(value) ? (value as SkillSelectionCandidate) : null
}

function toNodeKeySelectionCandidate(value: unknown): NodeKeySelectionCandidate | null {
    return isObjectValue(value) ? (value as NodeKeySelectionCandidate) : null
}

function normalizeSelectionSet(
    value: RuntimeCapabilitiesSelectionSetCandidate,
    fallbackWorkspaceId?: string
): TRuntimeCapabilitiesSelectionSet {
    const skills = toSkillSelectionCandidate(value.skills)
    const plugins = toNodeKeySelectionCandidate(value.plugins)
    const subAgents = toNodeKeySelectionCandidate(value.subAgents)
    const workspaceId =
        typeof skills?.workspaceId === 'string' && skills.workspaceId.trim()
            ? skills.workspaceId.trim()
            : fallbackWorkspaceId

    return {
        skills: {
            ...(workspaceId ? { workspaceId } : {}),
            ids: normalizeStringArray(skills?.ids)
        },
        plugins: {
            nodeKeys: normalizeStringArray(plugins?.nodeKeys)
        },
        subAgents: {
            nodeKeys: normalizeStringArray(subAgents?.nodeKeys)
        }
    }
}

function hasSelectionSet(selection?: TRuntimeCapabilitiesSelectionSet | null): boolean {
    return Boolean(
        selection &&
        (selection.skills.ids.length > 0 ||
            selection.plugins.nodeKeys.length > 0 ||
            (selection.subAgents?.nodeKeys.length ?? 0) > 0)
    )
}

function mergeSelectionSets(
    ...selections: Array<TRuntimeCapabilitiesSelectionSet | null | undefined>
): TRuntimeCapabilitiesSelectionSet {
    const workspaceId = selections.find((selection) => selection?.skills.workspaceId)?.skills.workspaceId

    return {
        skills: {
            ...(workspaceId ? { workspaceId } : {}),
            ids: mergeStringLists(...selections.map((selection) => selection?.skills.ids))
        },
        plugins: {
            nodeKeys: mergeStringLists(...selections.map((selection) => selection?.plugins.nodeKeys))
        },
        subAgents: {
            nodeKeys: mergeStringLists(...selections.map((selection) => selection?.subAgents?.nodeKeys))
        }
    }
}

export function normalizeRuntimeCapabilitiesSelection(
    value: unknown
): TRuntimeCapabilitiesSelectionWithRecommended | null {
    const candidate = toSelectionCandidate(value)
    if (!candidate || candidate.mode !== 'allowlist') {
        return null
    }

    const available = normalizeSelectionSet(candidate)
    const recommendedCandidate = toSelectionSetCandidate(candidate.recommended)
    const recommended = recommendedCandidate
        ? normalizeSelectionSet(recommendedCandidate, available.skills.workspaceId)
        : null
    const merged = mergeSelectionSets(available, recommended)

    return {
        mode: 'allowlist',
        ...merged,
        ...(hasSelectionSet(recommended) ? { recommended } : {})
    }
}

export function getRecommendedRuntimeSkillSelection(value: unknown): TRuntimeSkillSelection {
    const runtimeCapabilities = normalizeRuntimeCapabilitiesSelection(value)
    const recommendedSkills = runtimeCapabilities?.recommended?.skills
    if (!recommendedSkills?.ids.length) {
        return { ids: [] }
    }

    return {
        workspaceId: recommendedSkills.workspaceId ?? runtimeCapabilities.skills.workspaceId,
        ids: recommendedSkills.ids
    }
}

export function mergeRuntimeCapabilitiesSelection(
    current: TRuntimeCapabilitiesSelectionWithRecommended | null | undefined,
    next: TRuntimeCapabilitiesSelectionWithRecommended | null | undefined
): TRuntimeCapabilitiesSelectionWithRecommended | null {
    if (!current && !next) {
        return null
    }

    const recommended = mergeSelectionSets(current?.recommended, next?.recommended)
    const merged = mergeSelectionSets(current, next, recommended)

    return {
        mode: 'allowlist',
        ...merged,
        ...(hasSelectionSet(recommended) ? { recommended } : {})
    }
}

function getRuntimeCapabilitiesCandidateFromState(value: unknown): unknown {
    if (!isObjectValue(value)) {
        return null
    }
    const state = value as ChatStateCandidate
    const human = state[STATE_VARIABLE_HUMAN]
    if (!isObjectValue(human)) {
        return null
    }
    return (human as HumanStateCandidate)[RUNTIME_CAPABILITIES_HUMAN_INPUT_KEY]
}

export function getRuntimeCapabilitiesFromState(value: unknown): TRuntimeCapabilitiesSelectionWithRecommended | null {
    return normalizeRuntimeCapabilitiesSelection(getRuntimeCapabilitiesCandidateFromState(value))
}

export function hasExplicitRuntimeCapabilities(value: unknown): boolean {
    return normalizeRuntimeCapabilitiesSelection(getRuntimeCapabilitiesCandidateFromState(value)) !== null
}

function mergeStringLists(...lists: Array<string[] | undefined>): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of lists.flatMap((list) => list ?? [])) {
        if (!value || seen.has(value)) {
            continue
        }
        seen.add(value)
        result.push(value)
    }
    return result
}
