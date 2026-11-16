// All source kinds share the same deadline, actor check, provider dispatch and post-query revalidation.
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { GroupAnalyticsBindingCommand } from './commands/group-analytics-binding.command'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import {
	type AnalyticsDiscoveryRequest,
	type AnalyticsProviderDescriptor,
	type AnalyticsQueryRequest,
	type AnalyticsSourceRef,
	type AnalyticsSourceSummary
} from '@xpert-ai/contracts'
import {
	AnalyticsProviderRegistry,
	readAnalyticsProviderDiagnostic,
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
	type AnalyticsResolvedSource,
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
import { AnalyticsResultCache, analyticsCacheKey } from './analytics-result-cache'

/** Only platform modules supply resource adapters. Plugin providers cannot supply source options or ACLs. */
export const ANALYTICS_SOURCE_RESOLVERS = Symbol('ANALYTICS_SOURCE_RESOLVERS')
@Injectable()
@RuntimeCapabilityProvider(AnalyticsRuntimeCapability)
export class AnalyticsRuntimeService implements AnalyticsRuntimeApi {
	private readonly resultCache = new AnalyticsResultCache()
	private readonly providerEpochs = new WeakMap<AnalyticsQueryProvider, number>()
	private providerEpoch = 0
	constructor(
		private readonly providers: AnalyticsProviderRegistry,
		@Inject(ANALYTICS_SOURCE_RESOLVERS) private readonly resolvers: readonly AnalyticsSourceResolver[],
		private readonly commands: CommandBus
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
						providers: providers.map((provider) => {
							const restriction = item.providers.find(
								(candidate) => candidate.id === provider.descriptor.id
							)?.sharing
							return publicDescriptor({
								...provider.descriptor,
								...(restriction?.mode === 'owner_only' ? { sharing: restriction } : {})
							})
						})
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

	/** Host orchestration validates source disclosure authority; this does not grant recipient data access. */
	async authorizeGroupSharing(actor: DataSourceActor, binding: AnalyticsQueryRequest['binding']) {
		authorizeAnalyticsActor(actor)
		const parsed = analyticsQueryRequestSchema.safeParse({ binding, controls: {} })
		if (!parsed.success) throw analyticsError('ANALYTICS_INVALID_REQUEST')
		await this.withProvider(actor, binding.source, binding.providerId, async (provider, context) => {
			if (!provider.authorizeGroupSharing) throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
			await provider.authorizeGroupSharing(parsed.data.binding, context)
		})
	}

	/** Host-only group execution resolves bindings through accepted consent, never caller-provided native queries. */
	async queryGroupReference(
		actor: DataSourceActor,
		reference: { groupId: string; referenceId: string; datasetKey: string },
		controls: AnalyticsQueryRequest['controls']
	) {
		authorizeAnalyticsActor(actor)
		const selected = await this.commands.execute(
			new GroupAnalyticsBindingCommand(actor, reference.groupId, reference.referenceId, reference.datasetKey)
		)
		const parsed = analyticsQueryRequestSchema.safeParse({ binding: selected.binding, controls })
		if (!parsed.success) throw analyticsError('ANALYTICS_INVALID_REQUEST')
		const normalized = analyticsQueryRequestSchema.safeParse({
			binding: parsed.data.binding,
			controls: await selected.normalizeControls(parsed.data.controls)
		})
		if (!normalized.success) throw analyticsError('ANALYTICS_INVALID_REQUEST')
		const { binding } = normalized.data
		await selected.revalidate()
		const execute = (executionActor: DataSourceActor, source?: AnalyticsResolvedSource) =>
			this.withProvider(
				executionActor,
				binding.source,
				binding.providerId,
				async (provider, context) => {
					if (
						!provider.descriptor.operations.some(
							(operation) =>
								operation.readOnly &&
								operation.name === binding.operation &&
								operation.contractVersion === binding.contractVersion
						)
					)
						throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
					return normalizeAnalyticsResult(
						binding,
						await provider.execute(
							binding,
							resolveAnalyticsParameters(binding, normalized.data.controls),
							context
						),
						context.executionId,
						context.maxRows
					)
				},
				undefined,
				source ? async () => source : undefined
			)
		const result = selected.execute ? await selected.execute(execute) : await execute(actor, selected.source)
		await selected.revalidate()
		return selected.project(result)
	}

	async query(actor: DataSourceActor, input: AnalyticsQueryRequest, execution?: AnalyticsQueryExecution) {
		authorizeAnalyticsActor(actor)
		const parsed = analyticsQueryRequestSchema.safeParse(input)
		if (!parsed.success) throw analyticsError('ANALYTICS_INVALID_REQUEST')
		const { binding, controls, cache } = parsed.data
		return this.withProvider(
			actor,
			binding.source,
			binding.providerId,
			async (provider, context, revalidateAccess) => {
				if (
					!provider.descriptor.operations.some(
						(op) =>
							op.readOnly &&
							op.name === binding.operation &&
							op.contractVersion === binding.contractVersion
					)
				)
					throw analyticsError('ANALYTICS_CAPABILITY_UNAVAILABLE')
				const parameters = resolveAnalyticsParameters(binding, controls)
				const execute = async () =>
					normalizeAnalyticsResult(
						binding,
						await provider.execute(binding, parameters, context),
						context.executionId,
						context.maxRows
					)
				// Zero age disables reuse, but an explicit refresh must still invalidate older entries.
				if (!cache || (!cache.maxAgeMs && !cache.forceRefresh) || !provider.authorizeResultReuse)
					return execute()
				const authorize = async () => {
					const proof = await provider.authorizeResultReuse(binding, parameters, context)
					if (
						typeof proof?.sourceVersion !== 'string' ||
						!proof.sourceVersion ||
						proof.sourceVersion.length > 256
					)
						throw analyticsError('ANALYTICS_SOURCE_CHANGED')
					await revalidateAccess()
					return proof.sourceVersion
				}
				// A metadata lookup is not enough: authorize the exact query and capture a stable source revision.
				const revision = await authorize()
				// Reloading a provider invalidates its earlier results even if its public ID is unchanged.
				if (!this.providerEpochs.has(provider)) this.providerEpochs.set(provider, ++this.providerEpoch)
				// Resolved private options participate in the hash so credential/configuration rotation splits reuse.
				const key = analyticsCacheKey({
					actor,
					binding,
					parameters,
					options: context.options,
					revision,
					providerEpoch: this.providerEpochs.get(provider),
					maxRows: context.maxRows
				})
				const result = await this.resultCache.read(
					key,
					cache.maxAgeMs,
					cache.forceRefresh === true,
					async () => {
						// Admit only results produced under the same source revision that was authorized before execution.
						const value = await execute()
						if (value.provenance.sourceVersion !== revision || (await authorize()) !== revision)
							throw analyticsError('ANALYTICS_SOURCE_CHANGED')
						return value
					}
				)
				try {
					// Each waiter has its own identity, deadline and current source authorization.
					if ((await authorize()) !== revision) throw analyticsError('ANALYTICS_SOURCE_CHANGED')
					return result
				} catch (error) {
					this.resultCache.delete(key, result.provenance.executionId)
					throw error
				}
			},
			execution
		)
	}

	private async withProvider<T>(
		actor: DataSourceActor,
		source: AnalyticsSourceRef,
		providerId: string,
		run: (
			provider: AnalyticsQueryProvider,
			context: AnalyticsProviderContext,
			revalidateAccess: () => Promise<void>
		) => Promise<T>,
		parent?: AnalyticsQueryExecution,
		resolveSource?: () => Promise<Awaited<ReturnType<AnalyticsSourceResolver['resolve']>>>
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
						resolved = await (resolveSource ? resolveSource() : resolver.resolve(actor, source))
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
					const revalidateAccess = async () => {
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
					}
					let output: T
					try {
						output = await run(provider, context, revalidateAccess)
					} catch (error) {
						assertActive()
						if (error instanceof AnalyticsRuntimeError) throw error
						const dependencyError = analyticsRuntimeDependencyError(error)
						if (dependencyError) throw dependencyError
						const diagnostic = readAnalyticsProviderDiagnostic(error)
						if (diagnostic) {
							await revalidateAccess()
							throw new AnalyticsRuntimeError({
								...diagnostic,
								executionId: context.executionId,
								message: `${t('server-ai:Error.AnalyticsProviderDiagnostic', { defaultValue: 'Analytics provider reported:' })} ${diagnostic.message}`
							})
						}
						// Plugin HTTP exceptions are also untrusted; never forward embedded upstream credentials.
						throw analyticsError(
							error instanceof Error && SAFE_ANALYTICS_ERRORS.has(error.message)
								? error.message
								: error instanceof Error
									? (PROVIDER_VALIDATION_ERRORS.get(error.message) ?? 'ANALYTICS_QUERY_FAILED')
									: 'ANALYTICS_QUERY_FAILED'
						)
					}
					await revalidateAccess()
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
