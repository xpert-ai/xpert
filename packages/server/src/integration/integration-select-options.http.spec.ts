import { type INestApplication } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull } from 'typeorm'
import { User } from '../core/entities/internal'
import { UserService } from '../user'
import { IntegrationController } from './integration.controller'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'

// Legacy CRUD and SDK contexts share CLS in production; use one test context.
jest.mock('../core/context', () => ({ RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext }))

describe('Integration selection HTTP contract with scoped Service', () => {
	let app: INestApplication
	let origin: string
	const rows = [
		{ id: 'app', provider: 'fixture-provider', name: 'Review App', options: { privateKey: 'private-fixture' } }
	]
	const repository = {
		find: jest.fn(async () => rows),
		count: jest.fn(async () => 1),
		findAndCount: jest.fn(async () => [rows, 1])
	}
	beforeAll(async () => {
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue(
			Object.assign(new User(), { id: 'user', tenantId: 'tenant' })
		)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
		const module = await Test.createTestingModule({
			controllers: [IntegrationController],
			providers: [
				IntegrationService,
				{ provide: getRepositoryToken(Integration), useValue: repository },
				{
					provide: IntegrationStrategyRegistry,
					useValue: { list: () => [{ meta: { name: 'fixture-provider', avatar: 'fixture.svg' } }] }
				},
				{ provide: UserService, useValue: {} },
				{ provide: CommandBus, useValue: {} }
			]
		}).compile()
		app = module.createNestApplication({ logger: false })
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => jest.clearAllMocks())
	afterAll(async () => {
		await app?.close()
		jest.restoreAllMocks()
	})
	it('keeps tenantOnly scoped to the authenticated tenant even inside an organization', async () => {
		const response = await fetch(`${origin}/select-options?provider=fixture-provider&tenantOnly=true`)
		expect(response.status).toBe(200)
		expect(repository.find).toHaveBeenCalledWith({
			where: { provider: 'fixture-provider', tenant: { id: 'tenant' }, organizationId: IsNull() }
		})
		expect(repository.findAndCount).not.toHaveBeenCalled()
		expect(await response.json()).toEqual([{ value: 'app', label: 'Review App', avatar: 'fixture.svg' }])
	})
	it.each(['', '&tenantOnly=false'])('preserves organization selection by default: %s', async (query) => {
		expect((await fetch(`${origin}/select-options?provider=fixture-provider${query}`)).status).toBe(200)
		expect(repository.findAndCount).toHaveBeenCalledWith({
			where: { provider: 'fixture-provider', tenant: { id: 'tenant' }, organizationId: 'organization' }
		})
	})
	it('rejects a malformed scope selector before querying integrations', async () => {
		expect((await fetch(`${origin}/select-options?provider=fixture-provider&tenantOnly=all`)).status).toBe(400)
		expect(repository.find).not.toHaveBeenCalled()
		expect(repository.findAndCount).not.toHaveBeenCalled()
	})
})
