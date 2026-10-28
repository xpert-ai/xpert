import { PermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'
import { DataSourceRuntimeService } from './data-source-runtime.service'

jest.mock('./data-source.service', () => ({ DataSourceService: class {} }))
jest.mock('./data-source.entity', () => ({ DataSource: class {} }))
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'reader' }
function fixture(type = 'hana') {
	const source = {
		id: 'ecp',
		name: 'ECP',
		type: { type },
		updatedAt: new Date(1000),
		options: {
			host: 'host-only',
			username: 'reader',
			password: 'server-only',
			database: 'TENANT',
			catalog: 'DEFAULT_SCHEMA'
		}
	}
	const repository = { find: jest.fn().mockResolvedValue([source]), findOne: jest.fn().mockResolvedValue(source) }
	const sources = { prepareDataSource: jest.fn().mockResolvedValue(source) }
	const adapter = {
		engine: 'hana',
		query: jest.fn().mockResolvedValue({ rows: [] }),
		locations: jest.fn().mockResolvedValue([]),
		close: jest.fn().mockResolvedValue(undefined)
	}
	const runner = {
		getWorkbenchAdapter: jest.fn().mockReturnValue(adapter),
		teardown: jest.fn().mockResolvedValue(undefined)
	}
	const queryBus = { execute: jest.fn().mockResolvedValue(runner) }
	const service: DataSourceRuntimeService = Object.create(DataSourceRuntimeService.prototype)
	Object.defineProperties(service, {
		repository: { value: repository },
		sources: { value: sources },
		queryBus: { value: queryBus }
	})
	return { service, source, repository, sources, adapter, runner, queryBus }
}

beforeEach(() => {
	jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
	jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
	jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
	jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
})
afterEach(() => jest.restoreAllMocks())

test('lists HANA by its driver discriminator without exposing credentials', async () => {
	const { service, repository } = fixture()
	await expect(service.list(actor)).resolves.toEqual([{ id: 'ecp', name: 'ECP', engine: 'hana' }])
	expect(repository.find).toHaveBeenCalledWith(
		expect.objectContaining({ where: { tenantId: 'tenant', organizationId: 'org' } })
	)
})
test('opens a HANA schema while preserving the configured tenant and saved options', async () => {
	const { service, source, queryBus, runner, adapter } = fixture()
	const scoped = await service.open({ actor, dataSourceId: 'ecp', location: { database: 'TENANT', schema: 'SALES' } })
	expect(queryBus.execute).toHaveBeenCalledWith(
		expect.objectContaining({ name: 'hana', options: { ...source.options, catalog: 'SALES' } })
	)
	expect(source.options.catalog).toBe('DEFAULT_SCHEMA')
	expect(scoped.engine).toBe('hana')
	expect(scoped).not.toHaveProperty('options')
	const signal = new AbortController().signal
	await scoped.query({ sql: 'SELECT 1 FROM DUMMY', mode: 'read' }, signal)
	expect(adapter.query).toHaveBeenCalledWith({ sql: 'SELECT 1 FROM DUMMY', mode: 'read' }, signal)
	await scoped.close()
	await scoped.close()
	expect(adapter.close).toHaveBeenCalledTimes(1)
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test('uses the saved HANA schema when discovery omits a location', async () => {
	const { service, source, queryBus } = fixture()
	const scoped = await service.open({ actor, dataSourceId: 'ecp' })
	expect(queryBus.execute).toHaveBeenCalledWith(expect.objectContaining({ options: source.options }))
	await scoped.close()
})
test.each([{ database: 'OTHER' }, { engineCatalog: 'internal' }, { engineCatalog: 'external' }])(
	'rejects HANA tenant or external-catalog overrides before constructing a runner: %p',
	async (location) => {
		const { service, queryBus } = fixture()
		await expect(service.open({ actor, dataSourceId: 'ecp', location })).rejects.toThrow()
		expect(queryBus.execute).not.toHaveBeenCalled()
	}
)
test('scope mismatch and revoked permissions fail before datasource access', async () => {
	const { service, sources } = fixture()
	await expect(service.open({ actor: { ...actor, organizationId: 'other' }, dataSourceId: 'ecp' })).rejects.toThrow(
		'scope mismatch'
	)
	jest.mocked(RequestContext.hasPermission).mockReturnValue(false)
	await expect(service.open({ actor, dataSourceId: 'ecp' })).rejects.toThrow('permission denied')
	expect(sources.prepareDataSource).not.toHaveBeenCalled()
})
test('rechecks permissions and source revision on every HANA query', async () => {
	const { service, repository, adapter, runner } = fixture()
	const scoped = await service.open({ actor, dataSourceId: 'ecp' })
	jest.mocked(RequestContext.hasPermission).mockImplementation(
		(permission) => permission !== PermissionsEnum.DATA_SOURCE_EDIT
	)
	await expect(scoped.query({ sql: 'DELETE FROM t', mode: 'write' })).rejects.toThrow('permission denied')
	expect(adapter.query).not.toHaveBeenCalled()
	repository.findOne.mockResolvedValue(null)
	await expect(scoped.locations()).rejects.toThrow('Data source changed')
	expect(adapter.locations).not.toHaveBeenCalled()
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test('tears down old HANA plugins that do not provide a workbench', async () => {
	const { service, runner, queryBus } = fixture()
	queryBus.execute.mockResolvedValue({ teardown: runner.teardown })
	await expect(service.open({ actor, dataSourceId: 'ecp' })).rejects.toThrow('Database plugin upgrade required')
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test.each(['mysql', 'doris', 'pg'])('keeps existing %s location mapping', async (type) => {
	const { service, source, queryBus } = fixture(type)
	const scoped = await service.open({ actor, dataSourceId: 'ecp', location: { database: 'OTHER', schema: 'PUBLIC' } })
	expect(queryBus.execute).toHaveBeenCalledWith(
		expect.objectContaining({
			options: {
				...source.options,
				...(type === 'pg' ? { database: 'OTHER', catalog: 'PUBLIC' } : { catalog: 'OTHER' })
			}
		})
	)
	await scoped.close()
})
