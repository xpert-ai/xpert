// All source kinds share the same deadline, actor check, provider dispatch and post-query revalidation.
import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import {
	type AnalyticsDiscoveryRequest,
	type AnalyticsProviderDescriptor,
	type AnalyticsQueryRequest,
	type AnalyticsSourceRef,
	type AnalyticsSourceSummary
} from '@xpert-ai/contracts'
import {
	AnalyticsProviderRegistry,
	AnalyticsRuntimeCapability,
	RuntimeCapabilityProvider,
	analyticsQueryRequestSchema,
	analyticsDiscoveryRequestSchema,
	analyticsDiscoveryResultSchema,
	analyticsSourceRefSchema,
	analyticsOptionsSchema,
	normalizeAnalyticsResult,
	resolveAnalyticsParameters,
	type AnalyticsRuntimeApi,
	type AnalyticsSourceResolver,
	type AnalyticsQueryExecution,
	type AnalyticsQueryProvider,
	type AnalyticsProviderContext,
	type DataSourceActor
} from '@xpert-ai/plugin-sdk'
import {
	analyticsError,
	AnalyticsRuntimeError,
	authorizeAnalyticsActor,
	SAFE_ANALYTICS_ERRORS
} from './analytics-errors'
import { analyticsRuntimeDependencyError } from './analytics-runtime-errors'
import { PROVIDER_VALIDATION_ERRORS } from './analytics-error-details'

/** Only platform modules supply resource adapters. Plugin providers cannot supply source options or ACLs. */
export const ANALYTICS_SOURCE_RESOLVERS = Symbol('ANALYTICS_SOURCE_RESOLVERS')
@Injectable()
@RuntimeCapabilityProvider(AnalyticsRuntimeCapability)
export class AnalyticsRuntimeService implements AnalyticsRuntimeApi {
	constructor(
		private readonly providers: AnalyticsProviderRegistry,
		@Inject(ANALYTICS_SOURCE_RESOLVERS) private readonly resolvers: readonly AnalyticsSourceResolver[]
	) {
		if (new Set(resolvers.map((item) => item.kind)).size !== resolvers.length)
			throw new Error('Duplicate analytics source resolver')
	}

	async list(actor: DataSourceActor): Promise<AnalyticsSourceSummary[]> {
		authorizeAnalyticsActor(actor)
		const sources: AnalyticsSourceSummary[] = []
		for (const resolver of this.resolvers) {
			for (const item of await resolver.list(actor)) {
				const source = analyticsSourceRefSchema.parse(item.source)
				if (source.kind !== resolver.kind) throw analyticsError('ANALYTICS_SOURCE_UNAVAILABLE')
				const providers = this.providers
					.list(actor.organizationId)
					.filter(
						(provider) =>
							provider.descriptor.sourceKinds.includes(resolver.kind) &&
							item.providers.some((candidate) => candidate.id === provider.descriptor.id)
					)
				if (providers.length)
					sources.push({
						source,
						name: item.name,
						providers: providers.map((provider) => publicDescriptor(provider.descriptor))
					})
			}
		}
		authorizeAnalyticsActor(actor)
		return sources
	}

	async discover(actor: DataSourceActor, input: AnalyticsDiscoveryRequest) {
		authorizeAnalyticsActor(actor)
		const parsed = analyticsDiscoveryRequestSchema.safeParse(input)
		if (!parsed.success) throw analyticsError('ANALYTICS_INVALID_REQUEST')
		const { source, providerId, request } = parsed.data
		return this.withProvider(actor, source, providerId, async (provider, context) => {
			if (!provider.discover) throw analyticsError('ANALYTICS_DISCOVERY_UNAVAILABLE')
			return analyticsDiscoveryResultSchema.parse(await provider.discover(request, context))
		})
	}

	async query(actor: DataSourceActor, input: AnalyticsQueryRequest, execution?: AnalyticsQueryExecution) {
		authorizeAnalyticsActor(actor)
		const parsed = analyticsQueryRequestSchema.safeParse(input)
		if (!parsed.success) throw analyticsError('ANALYTICS_INVALID_REQUEST')
		const { binding, controls } = parsed.data
		return this.withProvider(
			actor,
			binding.source,
			binding.providerId,
			async (provider, context) => {
				if (
					!provider.descriptor.operations.some(
						(op) =>
							op.readOnly &&
							op.name === binding.operation &&
							op.contractVersion === binding.contractVersion
					)
				)
					throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
				return normalizeAnalyticsResult(
					binding,
					await provider.execute(binding, resolveAnalyticsParameters(binding, controls), context),
					context.executionId,
					context.maxRows
				)
			},
			execution
		)
	}

	private async withProvider<T>(
		actor: DataSourceActor,
		source: AnalyticsSourceRef,
		providerId: string,
		run: (provider: AnalyticsQueryProvider, context: AnalyticsProviderContext) => Promise<T>,
		parent?: AnalyticsQueryExecution
	): Promise<T> {
		const resolver = this.resolvers.find((item) => item.kind === source.kind)
		if (!resolver) throw analyticsError('ANALYTICS_SOURCE_KIND_UNAVAILABLE')
		const provider = this.providers
			.list(actor.organizationId)
			.find((item) => item.descriptor.id === providerId && item.descriptor.sourceKinds.includes(source.kind))
		if (!provider) throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
		const deadlineAt = Math.min(Date.now() + 30000, parent?.deadlineAt ?? Infinity)
		if (deadlineAt <= Date.now() || parent?.signal.aborted) throw analyticsError('ANALYTICS_TIMEOUT')
		const ancestry = [...(parent?.ancestry ?? [])]
		if (ancestry.length >= 4 || ancestry.includes(providerId)) throw analyticsError('ANALYTICS_RECURSION_DENIED')
		ancestry.push(providerId)
		const controller = new AbortController()
		const assertActive = () => {
			if (controller.signal.aborted || Date.now() >= deadlineAt) throw analyticsError('ANALYTICS_TIMEOUT')
		}
		let abort: () => void
		let timer: ReturnType<typeof setTimeout>
		const cancelled = new Promise<never>((_resolve, reject) => {
			abort = () => {
				controller.abort()
				reject(analyticsError('ANALYTICS_TIMEOUT'))
			}
			timer = setTimeout(abort, deadlineAt - Date.now())
			parent?.signal.addEventListener('abort', abort, { once: true })
		})
		try {
			return await Promise.race([
				cancelled,
				(async () => {
					let resolved: Awaited<ReturnType<AnalyticsSourceResolver['resolve']>>
					try {
						resolved = await resolver.resolve(actor, source)
					} catch {
						throw analyticsError('ANALYTICS_SOURCE_UNAVAILABLE')
					}
					assertActive()
					if (!this.providers.list(actor.organizationId).includes(provider))
						throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
					if (!sameSource(source, resolved.source) || !resolved.providerIds.includes(providerId))
						throw analyticsError('ANALYTICS_SOURCE_UNAVAILABLE')
					const options = analyticsOptionsSchema.safeParse(resolved.options)
					if (!options.success) throw analyticsError('ANALYTICS_SOURCE_CONFIG_INVALID')
					const context: AnalyticsProviderContext = {
						actor,
						source,
						options: options.data,
						signal: controller.signal,
						maxRows: 1000,
						timeoutMs: deadlineAt - Date.now(),
						executionId: randomUUID(),
						deadlineAt,
						ancestry
					}
					let output: T
					try {
						output = await run(provider, context)
					} catch (error) {
						if (error instanceof AnalyticsRuntimeError) throw error
						const dependencyError = analyticsRuntimeDependencyError(error)
						if (dependencyError) throw dependencyError
						// Plugin HTTP exceptions are also untrusted; never forward embedded upstream credentials.
						throw analyticsError(
							error instanceof Error && SAFE_ANALYTICS_ERRORS.has(error.message)
								? error.message
								: error instanceof Error
									? (PROVIDER_VALIDATION_ERRORS.get(error.message) ?? 'ANALYTICS_QUERY_FAILED')
									: 'ANALYTICS_QUERY_FAILED'
						)
					}
					assertActive()
					authorizeAnalyticsActor(actor)
					if (!this.providers.list(actor.organizationId).includes(provider))
						throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
					try {
						await resolved.revalidate()
					} catch {
						throw analyticsError('ANALYTICS_SOURCE_CHANGED')
					}
					assertActive()
					authorizeAnalyticsActor(actor)
					if (!this.providers.list(actor.organizationId).includes(provider))
						throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
					return output
				})()
			])
		} finally {
			clearTimeout(timer)
			parent?.signal.removeEventListener('abort', abort)
			controller.abort()
		}
	}
}
function sameSource(left: AnalyticsSourceRef, right: AnalyticsSourceRef) {
	if (left.kind === 'definition')
		return (
			right.kind === 'definition' &&
			left.definitionId === right.definitionId &&
			left.versionId === right.versionId
		)
	if (left.kind === 'artifact')
		return right.kind === 'artifact' && left.artifactId === right.artifactId && left.versionId === right.versionId
	return right.kind === 'data-source' && left.dataSourceId === right.dataSourceId
}
function publicDescriptor(provider: AnalyticsProviderDescriptor): AnalyticsProviderDescriptor {
	return {
		id: provider.id,
		name: provider.name,
		sourceKinds: [...provider.sourceKinds],
		operations: provider.operations.map(({ name, contractVersion, readOnly }) => ({
			name,
			contractVersion,
			readOnly
		})),
		...(provider.sharing
			? {
					sharing: {
						mode: provider.sharing.mode,
						...(provider.sharing.reasonCode ? { reasonCode: provider.sharing.reasonCode } : {})
					}
				}
			: {})
	}
}
