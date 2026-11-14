import { Controller, ForbiddenException, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ViewExtensionRoutes } from './view-extension.controller'
import { ViewExtensionService } from './view-extension.service'

@Controller('view-hosts')
class DraftTestController extends ViewExtensionRoutes {
	constructor(service: ViewExtensionService) {
		super(service)
	}
}

describe('local draft binding HTTP validation', () => {
	let app: INestApplication
	let origin: string
	const getLocalDraftBinding = jest.fn(async () => ({ resourceId: 'r', scopeKey: 'a'.repeat(64), maxBytes: 1024 }))
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [DraftTestController],
			providers: [{ provide: ViewExtensionService, useValue: { getLocalDraftBinding } }]
		}).compile()
		app = module.createNestApplication()
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	afterAll(async () => app?.close())
	beforeEach(() => getLocalDraftBinding.mockClear())
	const route = '/view-hosts/agent/host/views/provider__view/local-draft-binding'
	it('validates through the mounted Nest route and forbids browser/proxy caching', async () => {
		const result = await fetch(origin + route + '?resourceId=r')
		expect(result.status).toBe(200)
		expect(result.headers.get('cache-control')).toBe('no-store')
		expect(getLocalDraftBinding).toHaveBeenCalledWith('agent', 'host', 'provider__view', 'r')
	})
	it('returns a non-cacheable denial when resource access is revoked', async () => {
		getLocalDraftBinding.mockRejectedValueOnce(new ForbiddenException('Access revoked'))
		const response = await fetch(origin + route + '?resourceId=r')
		expect(response.status).toBe(403)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(await response.json()).not.toHaveProperty('scopeKey')
	})
	it.each([
		'',
		'?resourceId=',
		'?resourceId=x&scopeKey=chosen',
		'?resourceId=x&tenantId=other&userId=owner',
		'?resourceId=a&resourceId=b',
		'?resourceId=' + 'x'.repeat(257)
	])('rejects malformed query %s before service authorization', async (query) => {
		const result = await fetch(origin + route + query)
		expect(result.status).toBe(400)
		expect(getLocalDraftBinding).not.toHaveBeenCalled()
	})
})
