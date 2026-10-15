import { INestApplication } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { Repository } from 'typeorm'
import {
	COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
	COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
	MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
	MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
	RolesEnum
} from '@xpert-ai/contracts'
import { RequestContext, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { RoleGuard, TenantPermissionGuard } from '../../shared/guards'
import { TenantSettingController } from './tenant-setting.controller'
import { TenantSetting } from './tenant-setting.entity'
import { TenantSettingService } from './tenant-setting.service'
import { TenantSettingMutationGuard } from './tenant-setting-mutation.guard'
import { TenantSettingSaveCommand } from './commands'

describe('global retention settings HTTP boundary', () => {
	const defaultTenantId = '00000000-0000-0000-0000-000000000001'
	const otherTenantId = '00000000-0000-0000-0000-000000000002'
	const settingId = '00000000-0000-0000-0000-000000000003'
	const repository = { find: jest.fn(), save: jest.fn(), update: jest.fn(), delete: jest.fn() }
	const service = new TenantSettingService(repository as unknown as Repository<TenantSetting>)
	let app: INestApplication
	let origin: string

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [TenantSettingController],
			providers: [
				{ provide: TenantSettingService, useValue: service },
				TenantSettingMutationGuard,
				{
					provide: CommandBus,
					useValue: {
						execute: (command: TenantSettingSaveCommand) =>
							service.saveSettngs(command.input, RequestContext.currentTenantId())
					}
				}
			]
		})
			.overrideGuard(TenantPermissionGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RoleGuard)
			.useValue({ canActivate: () => RequestContext.hasRole(RolesEnum.SUPER_ADMIN) })
			.compile()
		app = module.createNestApplication({ logger: false })
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})

	beforeEach(() => {
		setDefaultTenantId(defaultTenantId)
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(defaultTenantId)
		jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
		repository.find.mockResolvedValue([])
		repository.save.mockImplementation(async (settings) => settings)
		jest.spyOn(service, 'findOneByIdString').mockResolvedValue({
			id: settingId,
			name: COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
			tenantId: RequestContext.currentTenantId(),
			value: '20'
		} as TenantSetting)
	})

	afterEach(() => {
		jest.restoreAllMocks()
		jest.clearAllMocks()
		setDefaultTenantId(null)
	})
	afterAll(async () => app?.close())

	function send(method: string, path: string, body?: unknown) {
		return fetch(`${origin}${path}`, {
			method,
			headers: { 'Content-Type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		})
	}

	it('lets a default tenant SuperAdmin configure both policies', async () => {
		expect(await (await send('GET', '/retention-access')).json()).toBe(true)
		const response = await send('POST', '/', {
			[COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING]: 'true',
			[COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING]: '20',
			[MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING]: 'false',
			[MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING]: '60'
		})
		expect(response.status).toBe(201)
		expect(repository.save).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					tenantId: defaultTenantId,
					name: COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
					value: '20'
				})
			])
		)
	})

	it.each([
		COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
		COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
		MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
		MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING
	])('rejects other tenants changing %s, including mixed settings requests', async (name) => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(otherTenantId)
		expect(await (await send('GET', '/retention-access')).json()).toBe(false)
		expect((await send('POST', '/', { [name]: '1', tenant_title: 'Unchanged' })).status).toBe(403)
		expect(repository.find).not.toHaveBeenCalled()
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('allows unrelated tenant settings without global retention access', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(otherTenantId)
		expect((await send('POST', '/', { tenant_title: 'My tenant' })).status).toBe(201)
		expect(repository.save).toHaveBeenCalledWith([
			expect.objectContaining({ tenantId: otherTenantId, name: 'tenant_title', value: 'My tenant' })
		])
	})

	it('rejects non-SuperAdmin requests even in the default tenant', async () => {
		jest.spyOn(RequestContext, 'hasRole').mockReturnValue(false)
		expect((await send('POST', '/', { [COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING]: '10' })).status).toBe(403)
		expect(service.canManageRetention()).toBe(false)
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('fails closed when the default tenant identity is unavailable', async () => {
		setDefaultTenantId(null)
		expect(await (await send('GET', '/retention-access')).json()).toBe(false)
		expect((await send('POST', '/', { [COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING]: '10' })).status).toBe(403)
	})

	it.each(['PUT', 'DELETE'])('blocks %s through inherited setting row routes', async (method) => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(otherTenantId)
		expect((await send(method, `/${settingId}`, method === 'PUT' ? { value: '1' } : undefined)).status).toBe(403)
		expect(repository.update).not.toHaveBeenCalled()
		expect(repository.delete).not.toHaveBeenCalled()
	})

	it('blocks renaming an unrelated setting into a global retention setting', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(otherTenantId)
		jest.spyOn(service, 'findOneByIdString').mockResolvedValue({ name: 'tenant_title' } as TenantSetting)
		expect(
			(await send('PUT', `/${settingId}`, { name: COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING, value: '1' })).status
		).toBe(403)
	})

	it('blocks moving a setting into the default tenant', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(otherTenantId)
		jest.spyOn(service, 'findOneByIdString').mockResolvedValue({ name: 'tenant_title' } as TenantSetting)
		expect((await send('PUT', `/${settingId}`, { tenantId: defaultTenantId })).status).toBe(403)
		expect(repository.update).not.toHaveBeenCalled()
	})
})
