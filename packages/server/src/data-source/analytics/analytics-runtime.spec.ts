import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { z } from 'zod/v3'
import {
	AnalyticsProviderRegistry,
	RequestContext,
	type AnalyticsProviderResult,
	type AnalyticsQueryProvider
} from '@xpert-ai/plugin-sdk'
import type { AnalyticsBinding } from '@xpert-ai/contracts'
import { PermissionGuard } from '../../shared'
import { DataSource } from '../data-source.entity'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsRuntimeService } from './analytics-runtime.service'

const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'viewer' }
const binding: AnalyticsBinding = {
	schemaVersion: 1,
	id: 'test',
	dataSourceId: 'b1234567-1234-4234-8234-123456789012',
	providerId: 'test',
	operation: 'query',
	contractVersion: 1,
	payload: {},
	parameters: [],
	output: {
		datasetId: 'test',
		grain: [],
		fields: [
			{
				id: 'amount',
				sourceField: 'amount',
				label: 'Amount',
				role: 'measure',
				logicalType: 'float64',
				nullable: false
			}
		]
	}
}
const result: AnalyticsProviderResult = {
	columns: [{ key: 'amount' }],
	rows: [{ amount: 3 }],
	completeness: {
		returnedRows: 1,
		totalRows: 1,
		totalAccuracy: 'exact',
		scope: 'full_query_result',
		truncated: false
	},
	sourceFetchedAt: '2026-10-15T00:00:00Z'
}
describe('Analytics HTTP and execution boundaries', () => {
	let app: INestApplication
	let service: AnalyticsRuntimeService
	const findOne = jest.fn()
	const execute = jest.fn<Promise<AnalyticsProviderResult>, Parameters<AnalyticsQueryProvider['execute']>>()
	const discover = jest.fn()
	beforeEach(async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
		findOne
			.mockReset()
			.mockResolvedValue({
				id: binding.dataSourceId,
				type: { type: 'test' },
				updatedAt: new Date(0),
				options: {}
			})
		execute.mockReset().mockResolvedValue(result)
		discover
			.mockReset()
			.mockResolvedValue({
				schemaVersion: 1,
				items: [],
				queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {}, instructions: 'Read only' }
			})
		const provider = {
			descriptor: {
				id: 'test',
				name: 'Test',
				dataSourceTypes: ['test'],
				operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
			},
			execute,
			discover
		}
		const module = await Test.createTestingModule({
			controllers: [AnalyticsController],
			providers: [
				AnalyticsRuntimeService,
				{ provide: getRepositoryToken(DataSource), useValue: { findOne, find: jest.fn() } },
				{ provide: AnalyticsProviderRegistry, useValue: { list: () => [provider] } }
			]
		})
			.overrideGuard(PermissionGuard)
			.useValue({ canActivate: () => true })
			.compile()
		app = module.createNestApplication()
		await app.listen(0, '127.0.0.1')
		service = module.get(AnalyticsRuntimeService)
	})
	async function post(body: unknown, status: number) {
		const response = await fetch(`${await app.getUrl()}/analytics/query`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
		expect(response.status).toBe(status)
		return {
			body: z
				.object({
					code: z.string().optional(),
					rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional()
				})
				.passthrough()
				.parse(await response.json())
		}
	}
	afterEach(async () => {
		await app.close()
		jest.restoreAllMocks()
	})
	it('parses through the real HTTP pipe and rejects caller-supplied scope before execution', async () => {
		await post({ binding, controls: {}, userId: 'someone-else' }, 400)
		expect(execute).not.toHaveBeenCalled()
		const response = await post({ binding, controls: {} }, 201)
		expect(response.body.rows).toEqual([{ amount: 3 }])
		expect(findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: binding.dataSourceId, tenantId: actor.tenantId, organizationId: actor.organizationId }
			})
		)
	})
	it('denies mismatched actors and unavailable scoped sources', async () => {
		await expect(service.query({ ...actor, userId: 'other' }, { binding, controls: {} })).rejects.toMatchObject({
			status: 403
		})
		findOne.mockResolvedValue(null)
		await post({ binding, controls: {} }, 400)
		expect(execute).not.toHaveBeenCalled()
	})
	it('assigns execution IDs before provider entry and bounds child queries by parent deadline', async () => {
		const deadlineAt = Date.now() + 1200
		const output = await service.query(
			actor,
			{ binding, controls: {} },
			{ signal: new AbortController().signal, deadlineAt, ancestry: ['script'] }
		)
		const context = execute.mock.calls[0][2]
		expect(output.provenance.executionId).toBe(context.executionId)
		expect(context.deadlineAt).toBe(deadlineAt)
		expect(context.timeoutMs).toBeLessThanOrEqual(1200)
		expect(context.ancestry).toEqual(['script', 'test'])
		await expect(
			service.query(
				actor,
				{ binding, controls: {} },
				{ signal: new AbortController().signal, deadlineAt, ancestry: ['test'] }
			)
		).rejects.toBeDefined()
		expect(execute).toHaveBeenCalledTimes(1)
	})
	it('aborts running providers when their parent is cancelled', async () => {
		const parent = new AbortController()
		execute.mockImplementation(async (_binding, _parameters, context) => {
			parent.abort()
			expect(context.signal.aborted).toBe(true)
			return result
		})
		await expect(
			service.query(
				actor,
				{ binding, controls: {} },
				{ signal: parent.signal, deadlineAt: Date.now() + 5000, ancestry: [] }
			)
		).rejects.toBeDefined()
	})
	it('does not return a result after the source changes during execution', async () => {
		findOne
			.mockResolvedValueOnce({
				id: binding.dataSourceId,
				type: { type: 'test' },
				updatedAt: new Date(0),
				options: {}
			})
			.mockResolvedValueOnce({ id: binding.dataSourceId, updatedAt: new Date(1) })
		const response = await post({ binding, controls: {} }, 400)
		expect(response.body.code).toBe('ANALYTICS_SOURCE_CHANGED')
	})
	it('rejects malformed plugin results and never returns provider exception secrets', async () => {
		execute.mockResolvedValueOnce({ ...result, rows: [{ amount: 'bad' }] })
		expect((await post({ binding, controls: {} }, 400)).body.code).toBe('ANALYTICS_FIELD_TYPE_MISMATCH')
		execute.mockRejectedValueOnce(new Error('password=secret connection failure'))
		const response = await post({ binding, controls: {} }, 400)
		expect(JSON.stringify(response.body)).not.toContain('secret')
	})
	it('discovery uses scoped source access and validates both HTTP and provider results', async () => {
		const url = `${await app.getUrl()}/analytics/discover`
		const postDiscovery = (body: object) =>
			fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
		const input = { dataSourceId: binding.dataSourceId, providerId: binding.providerId, request: {} }
		expect((await postDiscovery({ ...input, actorId: 'other' })).status).toBe(400)
		expect(discover).not.toHaveBeenCalled()
		expect((await postDiscovery(input)).status).toBe(201)
		expect(discover.mock.calls[0][1].actor).toEqual(actor)
		discover.mockResolvedValueOnce({ credentials: 'secret' })
		const invalid = await postDiscovery(input)
		expect(invalid.status).toBe(400)
		expect(JSON.stringify(await invalid.json())).not.toContain('secret')
		findOne.mockResolvedValue(null)
		expect((await postDiscovery(input)).status).toBe(400)
		expect(discover).toHaveBeenCalledTimes(2)
	})
})
