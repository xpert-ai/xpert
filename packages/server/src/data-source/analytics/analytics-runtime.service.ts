import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import {
	PermissionsEnum,
	type AnalyticsDiscoveryRequest,
	type AnalyticsQueryRequest,
	type AnalyticsSourceSummary
} from '@xpert-ai/contracts'
import {
	AnalyticsProviderRegistry,
	AnalyticsRuntimeCapability,
	RuntimeCapabilityProvider,
	RequestContext,
	analyticsOptionsSchema,
	analyticsQueryRequestSchema,
	analyticsDiscoveryRequestSchema,
	analyticsDiscoveryResultSchema,
	normalizeAnalyticsResult,
	resolveAnalyticsParameters,
	type AnalyticsQueryExecution,
	type AnalyticsRuntimeApi,
	type AnalyticsQueryProvider,
	type AnalyticsProviderContext,
	type DataSourceActor
} from '@xpert-ai/plugin-sdk'
import { DataSource } from '../data-source.entity'

/** Scope comes from the host; plugins own query syntax; results are never cached across actors. */
@Injectable()
@RuntimeCapabilityProvider(AnalyticsRuntimeCapability)
export class AnalyticsRuntimeService implements AnalyticsRuntimeApi {
	constructor(
		@InjectRepository(DataSource) private readonly sources: Repository<DataSource>,
		private readonly providers: AnalyticsProviderRegistry
	) {}

	async list(actor: DataSourceActor): Promise<AnalyticsSourceSummary[]> {
		this.authorize(actor)
		const providers = this.providers.list(actor.organizationId)
		const sources = await this.sources.find({
			where: { tenantId: actor.tenantId, organizationId: actor.organizationId },
			relations: ['type'],
			take: 1000
		})
		return sources.flatMap((source) => {
			const type = source.type?.type
			const supported = providers.filter((provider) => provider.descriptor.dataSourceTypes.includes(type))
			return type && supported.length
				? [{ id: source.id, name: source.name, type, providers: supported.map((item) => item.descriptor) }]
				: []
		})
	}

	async discover(actor: DataSourceActor, input: AnalyticsDiscoveryRequest) {
		this.authorize(actor)
		const parsed = analyticsDiscoveryRequestSchema.safeParse(input)
		if (!parsed.success) throw queryError('ANALYTICS_INVALID_REQUEST')
		return this.withProvider(actor, parsed.data, async (provider, context) => {
			if (!provider.discover) throw queryError('ANALYTICS_DISCOVERY_UNAVAILABLE')
			return analyticsDiscoveryResultSchema.parse(await provider.discover(parsed.data.request, context))
		})
	}

	async query(actor: DataSourceActor, input: AnalyticsQueryRequest, execution?: AnalyticsQueryExecution) {
		this.authorize(actor)
		const parsed = analyticsQueryRequestSchema.safeParse(input)
		if (!parsed.success) throw queryError('ANALYTICS_INVALID_REQUEST')
		const { binding, controls } = parsed.data
		return this.withProvider(
			actor,
			binding,
			async (provider, context) => {
				if (
					!provider.descriptor.operations.some(
						(item) =>
							item.name === binding.operation &&
							item.contractVersion === binding.contractVersion &&
							item.readOnly
					)
				)
					throw queryError('ANALYTICS_CAPABILITY_UNAVAILABLE')
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
		binding: { dataSourceId: string; providerId: string },
		run: (provider: AnalyticsQueryProvider, context: AnalyticsProviderContext) => Promise<T>,
		parent?: AnalyticsQueryExecution
	): Promise<T> {
		const source = await this.sources.findOne({
			where: { id: binding.dataSourceId, tenantId: actor.tenantId, organizationId: actor.organizationId },
			relations: ['type']
		})
		if (!source?.type?.type) throw queryError('ANALYTICS_SOURCE_UNAVAILABLE')
		const provider = this.providers
			.list(actor.organizationId)
			.find((item) => item.descriptor.id === binding.providerId)
		if (!provider || !provider.descriptor.dataSourceTypes.includes(source.type.type))
			throw queryError('ANALYTICS_CAPABILITY_UNAVAILABLE')
		const options = analyticsOptionsSchema.safeParse(source.options ?? {})
		if (!options.success) throw queryError('ANALYTICS_SOURCE_CONFIG_INVALID')
		const controller = new AbortController()
		const deadlineAt = Math.min(Date.now() + 30_000, parent?.deadlineAt ?? Infinity)
		const timeoutMs = deadlineAt - Date.now()
		if (timeoutMs <= 0 || parent?.signal.aborted) throw queryError('ANALYTICS_TIMEOUT')
		const ancestry = [...(parent?.ancestry ?? [])]
		if (ancestry.length >= 4 || ancestry.includes(binding.providerId))
			throw queryError('ANALYTICS_RECURSION_DENIED')
		ancestry.push(binding.providerId)
		const abort = () => controller.abort()
		parent?.signal.addEventListener('abort', abort, { once: true })
		let timer: ReturnType<typeof setTimeout>
		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				controller.abort()
				reject(queryError('ANALYTICS_TIMEOUT'))
			}, timeoutMs)
		})
		try {
			const result = await Promise.race([
				timeout,
				run(provider, {
					actor,
					dataSourceId: source.id,
					options: options.data,
					signal: controller.signal,
					timeoutMs,
					maxRows: 1000,
					executionId: randomUUID(),
					deadlineAt,
					ancestry
				})
			])
			if (controller.signal.aborted) throw queryError('ANALYTICS_TIMEOUT')
			this.authorize(actor)
			if (!this.providers.list(actor.organizationId).includes(provider))
				throw queryError('ANALYTICS_CAPABILITY_UNAVAILABLE')
			const current = await this.sources.findOne({
				where: { id: source.id, tenantId: actor.tenantId, organizationId: actor.organizationId },
				select: { id: true, updatedAt: true }
			})
			if (!current || current.updatedAt?.getTime() !== source.updatedAt?.getTime())
				throw queryError('ANALYTICS_SOURCE_CHANGED')
			return result
		} catch (error) {
			if (error instanceof HttpException) throw error
			if (error instanceof Error && error.message === 'read_only_violation')
				throw queryError('ANALYTICS_READ_ONLY_VIOLATION')
			throw queryError(
				error instanceof Error && SAFE_RESULT_ERRORS.has(error.message)
					? error.message
					: 'ANALYTICS_QUERY_FAILED'
			)
		} finally {
			clearTimeout(timer)
			parent?.signal.removeEventListener('abort', abort)
		}
	}

	private authorize(actor: DataSourceActor) {
		if (
			!actor.tenantId ||
			!actor.organizationId ||
			!actor.userId ||
			actor.tenantId !== RequestContext.currentTenantId() ||
			actor.organizationId !== RequestContext.getOrganizationId() ||
			actor.userId !== RequestContext.currentUserId() ||
			!RequestContext.hasPermission(PermissionsEnum.DATA_SOURCE_VIEW)
		)
			throw new ForbiddenException({
				code: 'ANALYTICS_ACCESS_DENIED',
				message: t('server-ai:Error.AnalyticsAccessDenied', { defaultValue: 'Analytics access denied' })
			})
	}
}
const SAFE_RESULT_ERRORS = new Set([
	'ANALYTICS_FIELD_TYPE_MISMATCH',
	'ANALYTICS_FIELD_MISSING_OR_AMBIGUOUS',
	'ANALYTICS_GRAIN_MISMATCH',
	'ANALYTICS_PARAMETER_REQUIRED',
	'ANALYTICS_PARAMETER_INVALID',
	'ANALYTICS_UNKNOWN_CONTROL'
])
function queryError(code: string) {
	return new BadRequestException({
		code,
		message: `${t('server-ai:Error.AnalyticsQueryInvalid', { defaultValue: 'Analytics query is unavailable or invalid' })} (${code})`
	})
}
