import { BadRequestException, INestApplication, Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { AnalyticsBindingV2, AnalyticsVersionedSourceRef } from '@xpert-ai/contracts'
import {
	AnalyticsProviderRegistry,
	AnalyticsProviderRegistryV2,
	RequestContext,
	analyticsBindingSchema,
	AnalyticsRuntimeCapability,
	AnalyticsRuntimeCapabilityV2,
	RUNTIME_CAPABILITY_PROVIDER,
	type AnalyticsProviderResult,
	type AnalyticsQueryProviderV2,
	type AnalyticsSourceResolver
} from '@xpert-ai/plugin-sdk'
import { PermissionGuard } from '../shared'
import { DataSource } from '../data-source/data-source.entity'
import { AnalyticsController } from '../data-source/analytics/analytics.controller'
import { AnalyticsRuntimeService } from '../data-source/analytics/analytics-runtime.service'
import { AnalyticsRuntimeV2Service, ANALYTICS_SOURCE_RESOLVERS } from './analytics-runtime-v2.service'
import { AnalyticsV2Controller } from './analytics.controller'
import published from '../../../plugin-sdk/src/lib/data/analytics/testing/published-dashboard-v1.json'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
const bindings = published.manifest.bindings.map((binding) => analyticsBindingSchema.parse(binding))
const { dataSourceId, schemaVersion: _version, ...query } = bindings[0]
const source: AnalyticsVersionedSourceRef = { kind: 'definition', definitionId: dataSourceId, versionId: dataSourceId }
const native: AnalyticsBindingV2 = { ...query, schemaVersion: 2, providerId: 'native', source }
const result: AnalyticsProviderResult = {
	columns: [{ key: 'amount' }],
	rows: [{ amount: '12.50' }],
	completeness: { returnedRows: 1, totalAccuracy: 'unknown', scope: 'full_query_result', truncated: false },
	sourceFetchedAt: '2026-10-20T00:00:00Z'
}
const findOne = jest.fn(),
	executeLegacy = jest.fn(),
	executeNative = jest.fn(),
	revalidate = jest.fn(),
	resolve = jest.fn(),
	discover = jest.fn()
const legacyProviders = bindings.map((binding) => ({
	descriptor: {
		id: binding.providerId,
		name: binding.providerId,
		dataSourceTypes: [binding.providerId],
		operations: [{ name: 'query', contractVersion: 1, readOnly: true as const }],
		connectionType: { type: binding.providerId, name: 'legacy', configuration: { secret: 'not-public' } }
	},
	execute: executeLegacy,
	discover
}))
const provider: AnalyticsQueryProviderV2 = {
	descriptor: {
		id: 'native',
		name: 'Native',
		sourceKinds: ['definition', 'artifact'],
		operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
	},
	execute: executeNative,
	discover
}
const nativeList = jest.fn(),
	legacyList = jest.fn()
const resolver: AnalyticsSourceResolver = {
	kind: 'definition',
	resolve,
	list: async () => [{ source, name: 'Private definition', providers: [provider.descriptor] }]
}
@Module({
	controllers: [AnalyticsController],
	providers: [
		AnalyticsRuntimeService,
		{
			provide: getRepositoryToken(DataSource),
			useValue: {
				findOne,
				find: async () =>
					bindings.map((binding) => ({
						id: binding.dataSourceId,
						name: 'Legacy',
						type: { type: binding.providerId }
					}))
			}
		},
		{ provide: AnalyticsProviderRegistry, useValue: { list: legacyList } }
	],
	exports: [AnalyticsRuntimeService]
})
class LegacyModule {}

describe('dual analytics runtimes and immutable v1 dashboards', () => {
	let app: INestApplication, runtime: AnalyticsRuntimeV2Service
	beforeEach(async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
		legacyList.mockReset().mockReturnValue(legacyProviders)
		nativeList.mockReset().mockReturnValue([provider])
		findOne.mockReset().mockImplementation(async ({ where }) => {
			const binding = bindings.find((binding) => binding.dataSourceId === where.id)
			return binding
				? {
						id: where.id,
						type: { type: binding.providerId },
						updatedAt: new Date(0),
						options: { private: 'secret' }
					}
				: null
		})
		executeLegacy.mockReset().mockResolvedValue(result)
		executeNative.mockReset().mockResolvedValue(result)
		revalidate.mockReset().mockResolvedValue(undefined)
		resolve.mockReset().mockImplementation(async (_actor, source) => ({
			source,
			providerId: 'native',
			options: { private: 'secret' },
			revalidate
		}))
		discover.mockReset().mockResolvedValue({
			schemaVersion: 1,
			items: [],
			queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {}, instructions: 'Read' }
		})
		const module = await Test.createTestingModule({
			imports: [LegacyModule, RouterModule.register([{ path: 'data-source', module: LegacyModule }])],
			controllers: [AnalyticsV2Controller],
			providers: [
				AnalyticsRuntimeV2Service,
				{ provide: AnalyticsProviderRegistryV2, useValue: { list: nativeList } },
				{ provide: ANALYTICS_SOURCE_RESOLVERS, useValue: [resolver, { ...resolver, kind: 'artifact' }] }
			]
		})
			.overrideGuard(PermissionGuard)
			.useValue({ canActivate: () => true })
			.compile()
		runtime = module.get(AnalyticsRuntimeV2Service)
		app = module.createNestApplication()
		await app.listen(0, '127.0.0.1')
	})
	afterEach(async () => {
		await app.close()
		jest.restoreAllMocks()
	})
	async function post(path: string, body: unknown, status: number) {
		const response = await fetch(`${await app.getUrl()}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
		expect(response.status).toBe(status)
		return response.json()
	}
	it('keeps distinct capability registrations and routes all five saved bindings through unchanged v1 providers', async () => {
		expect(Reflect.getMetadata(RUNTIME_CAPABILITY_PROVIDER, AnalyticsRuntimeService)).toBe(
			AnalyticsRuntimeCapability
		)
		expect(Reflect.getMetadata(RUNTIME_CAPABILITY_PROVIDER, AnalyticsRuntimeV2Service)).toBe(
			AnalyticsRuntimeCapabilityV2
		)
		expect(AnalyticsRuntimeCapability.id).toBe('platform.datasource.analytics')
		const before = JSON.stringify(published)
		for (const binding of bindings) {
			for (const path of ['/data-source/analytics/query', '/analytics/query']) {
				const dataset = await post(path, { binding, controls: { region: 'East' } }, 201)
				expect(dataset.provenance.bindingId).toBe(binding.id)
				expect(dataset.rows).toEqual([{ amount: '12.50' }])
				expect(executeLegacy).toHaveBeenLastCalledWith(
					binding,
					{ region: 'East' },
					expect.objectContaining({
						actor,
						dataSourceId: binding.dataSourceId,
						options: { private: 'secret' }
					})
				)
			}
		}
		expect(executeNative).not.toHaveBeenCalled()
		expect(JSON.stringify(published)).toBe(before)
	})
	it('bridges a v2 database reference only in memory and keeps the v1 endpoint strict', async () => {
		const binding = { ...query, schemaVersion: 2, source: { kind: 'data-source', dataSourceId } }
		await post('/data-source/analytics/query', { binding }, 400)
		await post('/analytics/query', { binding }, 201)
		expect(executeLegacy.mock.calls[0][0]).toEqual(bindings[0])
		expect(binding).not.toHaveProperty('dataSourceId')
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
		await post('/analytics/query', { binding }, 403)
	})
	it.each(['definition', 'artifact'] as const)(
		'executes %s with the current actor, exact version and private options',
		async (kind) => {
			const source: AnalyticsVersionedSourceRef =
				kind === 'definition'
					? (native.source as AnalyticsVersionedSourceRef)
					: { kind, artifactId: dataSourceId, versionId: dataSourceId }
			jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
			await post('/analytics/query', { binding: { ...native, source } }, 201)
			expect(resolve).toHaveBeenCalledWith(actor, source)
			expect(executeNative.mock.calls[0][2]).toMatchObject({
				source,
				actor,
				options: { private: 'secret' },
				maxRows: 1000
			})
			expect(executeNative.mock.calls[0][2]).not.toHaveProperty('dataSourceId')
			expect(revalidate).toHaveBeenCalledTimes(1)
		}
	)
	it('rejects caller scope, missing versions, wrong owners and resolver version substitutions', async () => {
		await post('/analytics/query', { binding: native, tenantId: 'other' }, 400)
		await post(
			'/analytics/query',
			{ binding: { ...native, source: { kind: 'definition', definitionId: dataSourceId } } },
			400
		)
		await expect(
			runtime.query({ ...actor, userId: 'creator' }, { binding: native, controls: {} })
		).rejects.toMatchObject({ status: 403 })
		resolve.mockResolvedValueOnce({ source, providerId: 'other', options: {}, revalidate })
		expect((await post('/analytics/query', { binding: native }, 400)).code).toBe('ANALYTICS_SOURCE_UNAVAILABLE')
		resolve.mockResolvedValueOnce({
			source: { ...source, versionId: bindings[1].dataSourceId },
			providerId: 'native',
			options: {},
			revalidate
		})
		await post('/analytics/query', { binding: native }, 400)
		expect(executeNative).not.toHaveBeenCalled()
	})
	it('fails closed before Group B adapters are installed, with no legacy ID or latest-version fallback', async () => {
		const service = new AnalyticsRuntimeV2Service(
			app.get(AnalyticsRuntimeService),
			app.get(AnalyticsProviderRegistryV2),
			[]
		)
		await expect(service.query(actor, { binding: native, controls: {} })).rejects.toMatchObject({
			response: { code: 'ANALYTICS_SOURCE_KIND_UNAVAILABLE' }
		})
		expect(resolve).not.toHaveBeenCalled()
		expect(executeLegacy).not.toHaveBeenCalled()
	})
	it('rejects unsupported contracts, malformed results, revoked resources and unloaded providers', async () => {
		expect((await post('/analytics/query', { binding: { ...native, contractVersion: 2 } }, 400)).code).toBe(
			'ANALYTICS_CAPABILITY_UNAVAILABLE'
		)
		executeNative.mockResolvedValueOnce({ ...result, rows: [{ amount: 1 }] })
		expect((await post('/analytics/query', { binding: native }, 400)).code).toBe('ANALYTICS_FIELD_TYPE_MISMATCH')
		revalidate.mockRejectedValueOnce(new Error('revoked secret'))
		expect((await post('/analytics/query', { binding: native }, 400)).code).toBe('ANALYTICS_SOURCE_CHANGED')
		executeNative.mockImplementationOnce(async () => {
			nativeList.mockReturnValue([])
			return result
		})
		expect((await post('/analytics/query', { binding: native }, 400)).code).toBe('ANALYTICS_CAPABILITY_UNAVAILABLE')
	})
	it('bounds nested calls, rejects cycles and promptly cancels even uncooperative providers', async () => {
		const parent = new AbortController(),
			deadlineAt = Date.now() + 1000
		await runtime.query(
			actor,
			{ binding: native, controls: {} },
			{ signal: parent.signal, deadlineAt, ancestry: ['script'] }
		)
		expect(executeNative.mock.calls[0][2]).toMatchObject({ deadlineAt, ancestry: ['script', 'native'] })
		await expect(
			runtime.query(
				actor,
				{ binding: native, controls: {} },
				{ signal: parent.signal, deadlineAt, ancestry: ['native'] }
			)
		).rejects.toMatchObject({ response: { code: 'ANALYTICS_RECURSION_DENIED' } })
		executeNative.mockImplementationOnce(async () => {
			parent.abort()
			return new Promise(() => undefined)
		})
		await expect(
			runtime.query(actor, { binding: native, controls: {} }, { signal: parent.signal, deadlineAt, ancestry: [] })
		).rejects.toMatchObject({ response: { code: 'ANALYTICS_TIMEOUT' } })
	})
	it('bounds source resolution and never invokes a provider after a timed-out resolution', async () => {
		let finish: (value: Awaited<ReturnType<AnalyticsSourceResolver['resolve']>>) => void
		resolve.mockImplementationOnce(
			() =>
				new Promise((accept) => {
					finish = accept
				})
		)
		const request = runtime.query(
			actor,
			{ binding: native, controls: {} },
			{ signal: new AbortController().signal, deadlineAt: Date.now() + 15, ancestry: [] }
		)
		await expect(request).rejects.toMatchObject({ response: { code: 'ANALYTICS_TIMEOUT' } })
		finish({ source, providerId: 'native', options: {}, revalidate })
		await new Promise((accept) => setImmediate(accept))
		expect(executeNative).not.toHaveBeenCalled()
	})
	it('validates discovery, strips legacy connection schemas from lists and redacts plugin HTTP errors', async () => {
		await post('/analytics/discover', { source, providerId: 'native', actor: {} }, 400)
		await post('/analytics/discover', { source, providerId: 'native' }, 201)
		discover.mockResolvedValueOnce({ password: 'secret' })
		const failed = await post('/analytics/discover', { source, providerId: 'native' }, 400)
		expect(JSON.stringify(failed)).not.toContain('secret')
		executeNative.mockRejectedValueOnce(new BadRequestException({ credentials: 'secret' }))
		expect(JSON.stringify(await post('/analytics/query', { binding: native }, 400))).not.toContain('secret')
		// Only the definition adapter advertises a definition reference.
		const listRuntime = new AnalyticsRuntimeV2Service(
			app.get(AnalyticsRuntimeService),
			app.get(AnalyticsProviderRegistryV2),
			[resolver]
		)
		expect(JSON.stringify(await listRuntime.list(actor))).not.toMatch(/connectionType|configuration|private|secret/)
	})
})
