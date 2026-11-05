jest.mock('./business-area-access.service', () => ({ BusinessAreaAccessService: class BusinessAreaAccessService {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AddressInfo } from 'node:net'
import { BusinessAreaAccessController } from './business-area-access.controller'
import { BusinessAreaAccessService } from './business-area-access.service'

const area = 'c73fa534-f79f-4143-b71d-57da6e8ac976'
const subject = 'c73fa534-f79f-4143-b71d-57da6e8ac977'
describe('business area grant HTTP validation', () => {
	let app: INestApplication
	let baseUrl: string
	async function call(path: string, method = 'GET', body?: object) {
		return fetch(`${baseUrl}${path}`, {
			method,
			headers: { 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		})
	}
	const access = {
		upsert: jest.fn().mockResolvedValue({ id: subject }),
		explain: jest.fn().mockResolvedValue({ sources: [] }),
		capabilities: jest.fn().mockResolvedValue({ view: [], publish: [], manage: [] })
	}
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [BusinessAreaAccessController],
			providers: [{ provide: BusinessAreaAccessService, useValue: access }]
		}).compile()
		app = module.createNestApplication()
		await app.listen(0, '127.0.0.1')
		baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
	})
	beforeEach(() => jest.clearAllMocks())
	afterAll(async () => app.close())
	it('routes capability requests before parameterized paths and accepts a valid group grant', async () => {
		expect((await call('/access/capabilities')).status).toBe(200)
		const input = { subjectType: 'user_group', userGroupId: subject, role: 'publisher' }
		expect((await call(`/${area}/grants`, 'PUT', input)).status).toBe(200)
		expect(access.upsert).toHaveBeenCalledWith(area, input)
	})
	it.each([
		{ subjectType: 'user_group', userGroupId: subject, userId: subject, role: 'consumer' },
		{ subjectType: 'user', userId: subject, role: 'super_admin' },
		{ subjectType: 'user', userId: subject, role: 'consumer', organizationId: subject },
		{ subjectType: 'user_group', userGroupId: 'invalid', role: 'consumer' },
		{ subjectType: 'department', userId: subject, role: 'consumer' }
	])('rejects invalid or scope-injecting payloads before service execution', async (input) => {
		expect((await call(`/${area}/grants`, 'PUT', input)).status).toBe(400)
		expect(access.upsert).not.toHaveBeenCalled()
	})
	it('rejects extra explanation scope and invalid path ids', async () => {
		expect((await call(`/${area}/access?organizationId=${subject}`)).status).toBe(400)
		expect((await call('/bad/access')).status).toBe(406)
		expect(access.explain).not.toHaveBeenCalled()
	})
})
