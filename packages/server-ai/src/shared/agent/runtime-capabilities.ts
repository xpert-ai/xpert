import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'

export const RUNTIME_CAPABILITIES_HUMAN_INPUT_KEY = 'runtimeCapabilities'

export type TRuntimeCapabilitiesSelection = {
	mode: 'allowlist'
	skills: {
		workspaceId?: string
		ids: string[]
	}
	plugins: {
		nodeKeys: string[]
	}
	subAgents: {
		nodeKeys: string[]
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function normalizeStringArray(value: unknown): string[] {
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

export function normalizeRuntimeCapabilitiesSelection(value: unknown): TRuntimeCapabilitiesSelection | null {
	const record = asRecord(value)
	if (!record || record.mode !== 'allowlist') {
		return null
	}

	const skills = asRecord(record.skills)
	const plugins = asRecord(record.plugins)
	const subAgents = asRecord(record.subAgents)
	const workspaceId = typeof skills?.workspaceId === 'string' ? skills.workspaceId.trim() : ''

	return {
		mode: 'allowlist',
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

export function getRuntimeCapabilitiesFromState(value: unknown): TRuntimeCapabilitiesSelection | null {
	const state = asRecord(value)
	const human = asRecord(state?.[STATE_VARIABLE_HUMAN])
	return normalizeRuntimeCapabilitiesSelection(human?.[RUNTIME_CAPABILITIES_HUMAN_INPUT_KEY])
}

export function hasExplicitRuntimeCapabilities(value: unknown): boolean {
	const state = asRecord(value)
	const human = asRecord(state?.[STATE_VARIABLE_HUMAN])
	return normalizeRuntimeCapabilitiesSelection(human?.[RUNTIME_CAPABILITIES_HUMAN_INPUT_KEY]) !== null
}
