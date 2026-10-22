import { INestApplication, BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { AnalyticsBinding, AnalyticsSourceRef } from '@xpert-ai/contracts'
import {
	AnalyticsProviderRegistry,
	RequestContext,
	SandboxJobRuntimeError,
	type AnalyticsQueryProvider,
	type AnalyticsProviderResult
} from '@xpert-ai/plugin-sdk'
import { AnalyticsRuntimeService, ANALYTICS_SOURCE_RESOLVERS } from './analytics-runtime.service'
import { AnalyticsController } from './analytics.controller'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

const uuid = 'a1234567-1234-4234-8234-123456789012'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
const source: AnalyticsSourceRef = { kind: 'definition', definitionId: uuid, versionId: uuid }
const binding: AnalyticsBinding = {
	id: 'sales',
	source,
	providerId: 'file.table',
	operation: 'query',
	contractVersion: 1,
	payload: {},
	parameters: [],
	output: {
		datasetId: 'sales',
		grain: [],
		fields: [
			{
				id: 'amount',
				sourceField: 'amount',
				label: 'Amount',
				logicalType: 'decimal',
				role: 'measure',
				nullable: false
			}
		]
	}
}
const result: AnalyticsProviderResult = {
	columns: [{ key: 'amount' }],
	rows: [{ amount: '12.50' }],
	sourceFetchedAt: '2026-10-21T00:00:00Z',
	completeness: {
		returnedRows: 1,
		totalAccuracy: 'exact',
		totalRows: 1,
		scope: 'full_query_result',
		truncated: false
	}
}
describe('one Analytics Runtime for governed sources', () => {
	let app: INestApplication, runtime: AnalyticsRuntimeService
	const execute = jest.fn(),
		discover = jest.fn(),
		resolve = jest.fn(),
		revalidate = jest.fn(),
		list = jest.fn()
	const provider: AnalyticsQueryProvider = {
		descriptor: {
			id: 'file.table',
			name: 'Files',
			sourceKinds: ['definition', 'artifact', 'data-source'],
			operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
		},
		execute,
		discover
	}
	beforeEach(async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
		list.mockReset().mockReturnValue([provider])
		execute.mockReset().mockResolvedValue(result)
		revalidate.mockReset().mockResolvedValue(undefined)
		resolve.mockReset().mockImplementation(async (_actor, ref) => ({
			source: ref,
			providerIds: ['file.table'],
			options: { private: 'secret' },
			revalidate
		}))
		discover.mockReset().mockResolvedValue({
			items: [],
			queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {}, instructions: 'Read' }
		})
		const module = await Test.createTestingModule({
			controllers: [AnalyticsController],
			providers: [
				AnalyticsRuntimeService,
				{ provide: AnalyticsProviderRegistry, useValue: { list } },
				{
					provide: ANALYTICS_SOURCE_RESOLVERS,
					useValue: ['definition', 'artifact', 'data-source'].map((kind) => ({
						kind,
						resolve,
						list: async () => []
					}))
				}
			]
		}).compile()
		runtime = module.get(AnalyticsRuntimeService)
		app = module.createNestApplication()
		await app.listen(0, '127.0.0.1')
	})
	afterEach(async () => {
		await app.close()
		jest.restoreAllMocks()
	})
	async function post(body: unknown) {
		const response = await fetch(`${await app.getUrl()}/analytics/query`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
		return { status: response.status, body: await response.json() }
	}
	it.each<AnalyticsSourceRef>([
		source,
		{ kind: 'artifact', artifactId: uuid, versionId: uuid },
		{ kind: 'data-source', dataSourceId: uuid }
	])('executes $kind through the same source checks and normalization', async (ref) => {
		const response = await post({ binding: { ...binding, source: ref }, controls: {} })
		expect(response.status).toBe(201)
		expect(response.body.rows).toEqual([{ amount: '12.50' }])
		expect(revalidate).toHaveBeenCalledTimes(1)
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({ source: ref }),
			{},
			expect.objectContaining({ actor, source: ref, options: { private: 'secret' } })
		)
	})
	it.each([
		{ ...binding, source: { kind: 'definition', definitionId: uuid } },
		{ ...binding, dataSourceId: uuid },
		{ ...binding, schemaVersion: 1 },
		{ ...binding, source: { ...source, userId: uuid } }
	])('rejects invalid/obsolete envelopes at HTTP boundary', async (invalid) => {
		expect((await post({ binding: invalid, controls: {} })).status).toBe(400)
		expect(execute).not.toHaveBeenCalled()
	})
	it('denies caller scope substitution and resource/provider mismatches', async () => {
		await expect(runtime.query({ ...actor, userId: 'owner' }, { binding, controls: {} })).rejects.toThrow()
		resolve.mockResolvedValue({ source, providerIds: ['other'], options: {}, revalidate })
		await expect(runtime.query(actor, { binding, controls: {} })).rejects.toThrow()
		expect(execute).not.toHaveBeenCalled()
	})
	it('fails after revocation, version tampering or provider unload', async () => {
		revalidate.mockRejectedValue(new Error('revoked'))
		await expect(runtime.query(actor, { binding, controls: {} })).rejects.toThrow()
		revalidate.mockResolvedValue(undefined)
		execute.mockImplementation(async () => {
			list.mockReturnValue([])
			return result
		})
		await expect(runtime.query(actor, { binding, controls: {} })).rejects.toThrow()
	})
	it('keeps duplicate rows and gives Agent tools an actionable grain error', async () => {
		execute.mockResolvedValue({
			...result,
			rows: [...result.rows, ...result.rows],
			completeness: { ...result.completeness, returnedRows: 2, totalRows: 2 }
		})
		const duplicate = { ...binding, output: { ...binding.output, grain: ['amount'] } }
		const response = await post({ binding: duplicate, controls: {} })
		expect(response.status).toBe(400)
		expect(response.body.code).toBe('ANALYTICS_GRAIN_MISMATCH')
		expect(response.body.message).toContain('empty grain')
		await expect(runtime.query(actor, { binding: duplicate, controls: {} })).rejects.toThrow(
			'Do not discard source rows'
		)
		const repaired = await post({ binding, controls: {} })
		expect(repaired.status).toBe(201)
		expect(repaired.body.rows).toHaveLength(2)
	})
	it('redacts provider HTTP errors', async () => {
		execute.mockRejectedValue(new BadRequestException('credential-secret'))
		const response = await post({ binding, controls: {} })
		expect(response.status).toBe(400)
		expect(JSON.stringify(response.body)).not.toContain('credential-secret')
	})
	it.each([
		['SANDBOX_RUNTIME_UNAVAILABLE', false, 'binding'],
		['SANDBOX_ACTION_UNAVAILABLE', false, 'contracts'],
		['SANDBOX_ACTION_INVALID', false, 'contracts'],
		['SANDBOX_PROFILE_UNAVAILABLE', false, 'contracts'],
		['SANDBOX_VERSION_MISMATCH', false, 'contracts'],
		['SANDBOX_START_FAILED', true, 'capacity'],
		['SANDBOX_CAPACITY_UNAVAILABLE', true, 'capacity']
	] as const)('preserves %s with safe diagnostics at the HTTP boundary', async (code, retryable, hint) => {
		execute.mockRejectedValue(
			new SandboxJobRuntimeError(code, 'credential-secret /private/host', !retryable, 'secret-job')
		)
		const response = await post({ binding, controls: {} })
		expect(response.status).toBe(400)
		expect(response.body).toEqual({ code, retryable, message: expect.stringContaining(hint) })
		expect(JSON.stringify(response.body)).not.toMatch(/credential-secret|private\/host|secret-job/)
	})
	it('recognizes a dependency error from another SDK instance without forwarding its properties', async () => {
		execute.mockRejectedValue({
			name: 'SandboxJobRuntimeError',
			code: 'SANDBOX_RUNTIME_UNAVAILABLE',
			message: 'credential-secret',
			retryable: false,
			jobId: 'secret-job',
			details: 'secret-details'
		})
		const response = await post({ binding, controls: {} })
		expect(response.body.code).toBe('SANDBOX_RUNTIME_UNAVAILABLE')
		expect(response.body.message).toContain('matching Runtime Suite binding')
		expect(JSON.stringify(response.body)).not.toContain('secret')
	})
	it.each([
		new BadRequestException({ code: 'SANDBOX_RUNTIME_UNAVAILABLE', message: 'credential-secret' }),
		{ name: 'SandboxJobRuntimeError', code: 'SANDBOX_RUNTIME_UNAVAILABLE', message: 'credential-secret' },
		{ name: 'SandboxJobRuntimeError', code: 'UNKNOWN', message: 'credential-secret', retryable: true }
	])('keeps unrecognized errors redacted', async (error) => {
		execute.mockRejectedValue(error)
		const response = await post({ binding, controls: {} })
		expect(response.body.code).toBe('ANALYTICS_QUERY_FAILED')
		expect(JSON.stringify(response.body)).not.toContain('credential-secret')
	})
	it('reports invalid script input with fixed guidance and no runner output', async () => {
		execute.mockRejectedValue(
			new SandboxJobRuntimeError(
				'EXPORT_INPUT_INVALID',
				'ModuleNotFoundError: credential-secret /host/private',
				true,
				'private-job'
			)
		)
		const response = await post({ binding, controls: {} })
		expect(response.body).toEqual({
			code: 'EXPORT_INPUT_INVALID',
			retryable: false,
			message: expect.stringContaining('standard libraries')
		})
		expect(JSON.stringify(response.body)).not.toMatch(/credential-secret|host\/private|private-job/)
	})
	it('propagates parent cancellation even if a provider ignores its signal', async () => {
		execute.mockImplementation(() => new Promise(() => undefined))
		const controller = new AbortController()
		const promise = runtime.query(
			actor,
			{ binding, controls: {} },
			{ signal: controller.signal, deadlineAt: Date.now() + 1000, ancestry: [] }
		)
		controller.abort()
		await expect(promise).rejects.toThrow()
	})
	it('blocks recursion and expired deadlines before source/provider execution', async () => {
		await expect(
			runtime.query(
				actor,
				{ binding, controls: {} },
				{ signal: new AbortController().signal, deadlineAt: Date.now() - 1, ancestry: [] }
			)
		).rejects.toThrow()
		await expect(
			runtime.query(
				actor,
				{ binding, controls: {} },
				{ signal: new AbortController().signal, deadlineAt: Date.now() + 1000, ancestry: ['file.table'] }
			)
		).rejects.toThrow()
		expect(execute).not.toHaveBeenCalled()
	})
})
