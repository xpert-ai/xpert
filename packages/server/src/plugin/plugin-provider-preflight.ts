/**
 * Invariants: reject declared registration conflicts before Nest instantiates a plugin.
 * Validate the whole candidate before publishing claims; rejected modules must not
 * expose controllers, lifecycle hooks or a partial set of tool adapters.
 */
import type { DynamicModule } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { t } from 'i18next'
import {
	AGENT_MIDDLEWARE_STRATEGY,
	TOOLSET_STRATEGY,
	XPERT_TOOL_PROVIDER_METADATA,
	assertXpertToolProviderClaims,
	describeXpertToolProvider,
	resolveStrategyMetadataTarget,
	type XpertToolProviderClaim
} from '@xpert-ai/plugin-sdk'

interface StrategyClaim {
	kind: 'toolset' | 'middleware'
	key: string
}

export interface PluginProviderClaims {
	pluginName: string
	scopeKey: string
	tools: XpertToolProviderClaim[]
	strategies: StrategyClaim[]
}

export class PluginProviderPreflightError extends Error {
	readonly code = 'plugin-provider-registration-failed'
	constructor(pluginName: string, cause: string) {
		super(
			t('server-ai:Error.PluginProviderPreflightFailed', {
				defaultValue: "Plugin '{{pluginName}}' failed provider preflight: {{cause}}",
				pluginName,
				cause
			})
		)
		this.name = 'PluginProviderPreflightError'
	}
}

/** Read only declarations the plugin root publishes; never invoke constructors or factories. */
export function declaredPluginProviders(module: DynamicModule): object[] {
	const reflected: unknown = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module.module)
	if (reflected !== undefined && !Array.isArray(reflected))
		throw new Error(
			t('server-ai:Error.PluginProviderMetadataInvalid', {
				defaultValue: 'Invalid plugin provider declaration metadata'
			})
		)
	const result = new Set<object>()
	for (const provider of [...(Array.isArray(reflected) ? reflected : []), ...(module.providers ?? [])]) {
		const target = declarationTarget(provider)
		if (target) result.add(target)
	}
	return [...result]
}

function declarationTarget(provider: unknown): object | undefined {
	if (typeof provider === 'function') return provider
	if (!provider || typeof provider !== 'object') return undefined
	if ('useClass' in provider && typeof provider.useClass === 'function') return provider.useClass
	if ('useValue' in provider && provider.useValue && typeof provider.useValue === 'object') return provider.useValue
	if ('useExisting' in provider && typeof provider.useExisting === 'function') return provider.useExisting
	if ('useFactory' in provider && 'provide' in provider && typeof provider.provide === 'function')
		return provider.provide
	return undefined
}

function metadataKey(target: object, kind: string): string | undefined {
	const value: unknown = Reflect.getMetadata(kind, target)
	if (value === undefined) return undefined
	if (typeof value !== 'string' || !value)
		throw new Error(
			t('server-ai:Error.PluginProviderMetadataInvalid', {
				defaultValue: 'Invalid plugin provider declaration metadata'
			})
		)
	return value
}

export function preflightPluginProviders(
	module: DynamicModule,
	pluginName: string,
	scopeKey: string,
	existing: PluginProviderClaims[]
): PluginProviderClaims {
	const candidate: PluginProviderClaims = { pluginName, scopeKey, tools: [], strategies: [] }
	const others = existing.filter((item) => item.scopeKey === scopeKey && item.pluginName !== pluginName)
	try {
		for (const declaration of declaredPluginProviders(module)) {
			const target = resolveStrategyMetadataTarget(declaration)
			if (!target) continue
			const toolset = metadataKey(target, TOOLSET_STRATEGY)
			const middleware = metadataKey(target, AGENT_MIDDLEWARE_STRATEGY)
			if (toolset) candidate.strategies.push({ kind: 'toolset', key: toolset })
			if (middleware) candidate.strategies.push({ kind: 'middleware', key: middleware })
			if (!Reflect.getMetadata(XPERT_TOOL_PROVIDER_METADATA, target)) continue
			// Object.create preserves prototype method metadata without running plugin code.
			const instance: object =
				typeof declaration === 'function' ? Object.create(declaration.prototype) : declaration
			const descriptor = describeXpertToolProvider(instance)
			const claim: XpertToolProviderClaim = { descriptor, source: { kind: 'plugin', pluginName, scopeKey } }
			assertXpertToolProviderClaims(claim, [...others.flatMap((item) => item.tools), ...candidate.tools])
			candidate.tools.push(claim)
			candidate.strategies.push({ kind: 'toolset', key: descriptor.options.provider })
			for (const definition of descriptor.options.middlewares ?? []) {
				if (descriptor.tools.some((tool) => tool.middlewareProvider === definition.provider)) {
					candidate.strategies.push({ kind: 'middleware', key: definition.provider })
				}
			}
		}
		const seen = new Set<string>()
		for (const claim of candidate.strategies) {
			const key = `${claim.kind}:${claim.key}`
			if (seen.has(key))
				throw new Error(
					t('server-ai:Error.PluginProviderClaimDuplicate', {
						defaultValue: "Duplicate {{kind}} '{{key}}' inside the plugin",
						kind: claim.kind,
						key: claim.key
					})
				)
			seen.add(key)
			const conflict = others.find((item) =>
				item.strategies.some((other) => other.kind === claim.kind && other.key === claim.key)
			)
			if (conflict)
				throw new Error(
					t('server-ai:Error.PluginProviderClaimConflict', {
						defaultValue:
							"{{kind}} '{{key}}' is already registered by '{{pluginName}}' in scope '{{scopeKey}}'",
						kind: claim.kind,
						key: claim.key,
						pluginName: conflict.pluginName,
						scopeKey
					})
				)
		}
		return candidate
	} catch (error) {
		throw new PluginProviderPreflightError(
			pluginName,
			error instanceof Error
				? error.message
				: t('server-ai:Error.PluginProviderMetadataInvalid', {
						defaultValue: 'Invalid plugin provider declaration metadata'
					})
		)
	}
}
