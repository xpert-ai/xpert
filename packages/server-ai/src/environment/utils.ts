import { IEnvironment, TEnvironmentVariable } from '@metad/contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toEnvState(env: IEnvironment) {
	return env && {
		env:
			env.variables?.reduce((state, variable) => {
				state[variable.name] = variable.value
				return state
			}, {}) ?? {}
	}
}

export function mergeRuntimeContextWithEnv<T extends Record<string, unknown>>(
	context: T | null | undefined,
	environment: IEnvironment | null | undefined
): (T & { env?: Record<string, unknown> }) | undefined {
	const runtimeEnv = toEnvState(environment)?.env
	const runtimeContext: Record<string, unknown> & { env?: Record<string, unknown> } = context ? { ...context } : {}
	const contextEnv =
		runtimeContext.env && typeof runtimeContext.env === 'object'
			? { ...(runtimeContext.env as Record<string, unknown>) }
			: undefined

	if (contextEnv || runtimeEnv) {
		runtimeContext.env = {
			...(contextEnv ?? {}),
			...(runtimeEnv ?? {})
		}
	}

	return Object.keys(runtimeContext).length ? (runtimeContext as T & { env?: Record<string, unknown> }) : undefined
}

export function getContextEnvState(context: unknown): Record<string, unknown> | undefined {
	if (!isRecord(context)) {
		return undefined
	}

	const envState = context['env']
	return isRecord(envState) ? envState : undefined
}

function normalizeEnvironmentValue(value: unknown): string | null {
	if (value == null) {
		return null
	}

	if (typeof value === 'string') {
		return value
	}

	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value)
	}

	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

export function mergeEnvironmentWithEnvState(
	environment: IEnvironment | null | undefined,
	envState: Record<string, unknown> | null | undefined
): IEnvironment | undefined {
	if (!envState || !Object.keys(envState).length) {
		return environment ?? undefined
	}

	const baseVariables = environment?.variables ?? []
	const variablesByName = new Map<string, TEnvironmentVariable>(
		baseVariables.map((variable) => [variable.name, { ...variable }])
	)

	for (const [name, rawValue] of Object.entries(envState)) {
		const value = normalizeEnvironmentValue(rawValue)
		if (value == null) {
			continue
		}

		const previous = variablesByName.get(name)
		variablesByName.set(name, {
			name,
			value,
			type: previous?.type ?? 'secret',
			...(previous?.owner ? { owner: previous.owner } : {})
		})
	}

	return {
		...(environment ?? { name: 'Request Environment' }),
		variables: Array.from(variablesByName.values())
	} as IEnvironment
}
