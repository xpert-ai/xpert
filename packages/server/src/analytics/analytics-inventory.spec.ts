import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AnalyticsProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from '../data-source/data-source.entity'
import { AnalyticsInventoryController } from './analytics-inventory.controller'
import { AnalyticsInventoryService } from './analytics-inventory.service'

const sourceId = 'b1234567-1234-4234-8234-123456789012'
describe('read-only source inventory HTTP boundary', () => {
	let app: INestApplication
	const findAndCount = jest.fn()
	beforeEach(async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('viewer')
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
		findAndCount.mockReset().mockResolvedValue([
			[
				{
					id: sourceId,
					type: { type: 'workspace-files' },
					updatedAt: new Date(0),
					options: {
						credential: 'secret',
						datasets: [{ id: 'sales', revision: 'v1', filePath: 'private.csv' }]
					}
				}
			],
			101
		])
		const module = await Test.createTestingModule({
			controllers: [AnalyticsInventoryController],
			providers: [
				AnalyticsInventoryService,
				{ provide: getRepositoryToken(DataSource), useValue: { findAndCount } },
				{
					provide: AnalyticsProviderRegistry,
					useValue: {
						list: () => [{ descriptor: { id: 'file.table', dataSourceTypes: ['workspace-files'] } }]
					}
				}
			]
		}).compile()
		app = module.createNestApplication()
		await app.listen(0, '127.0.0.1')
	})
	afterEach(async () => {
		await app.close()
		jest.restoreAllMocks()
	})
	it('coerces bounded page queries and filters by trusted organization and explicit legacy types', async () => {
		const response = await fetch(`${await app.getUrl()}/analytics/migration-inventory/sources?page=2`)
		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).not.toMatch(/secret|credential|private.csv/)
		expect(body).toContain('provider-validation-required')
		expect(findAndCount).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'organization' }),
				skip: 100,
				take: 100,
				order: { id: 'ASC' }
			})
		)
	})
	it.each(['?page=0', '?page=1.5', '?page=bad', '?page=1&tenantId=other'])(
		'rejects invalid pagination or caller scope %s',
		async (query) => {
			expect((await fetch(`${await app.getUrl()}/analytics/migration-inventory/sources${query}`)).status).toBe(
				400
			)
			expect(findAndCount).not.toHaveBeenCalled()
		}
	)
	it('requires the existing source permission and never permits a mutation method', async () => {
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
		expect((await fetch(`${await app.getUrl()}/analytics/migration-inventory/sources`)).status).toBe(403)
		expect(findAndCount).not.toHaveBeenCalled()
		expect(
			(await fetch(`${await app.getUrl()}/analytics/migration-inventory/sources`, { method: 'POST' })).status
		).toBe(404)
	})
})
