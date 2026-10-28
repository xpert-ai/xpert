import { PermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'
import { DataSourceRuntimeService } from './data-source-runtime.service'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

jest.mock('./data-source.service', () => ({ DataSourceService: class {} }))
jest.mock('./data-source.entity', () => ({ DataSource: class {} }))

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'reader' }
function fixture(type = 'example-driver', engine = 'example.engine') {
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
		engine,
		query: jest.fn().mockResolvedValue({ rows: [] }),
		locations: jest.fn().mockResolvedValue([]),
		close: jest.fn().mockResolvedValue(undefined)
	}
	const runner = {
		getWorkbenchAdapter: jest.fn().mockReturnValue(adapter),
		teardown: jest.fn().mockResolvedValue(undefined)
	}
	const strategy = { type, workbench: { engine }, create: jest.fn().mockResolvedValue(runner) }
	const strategies = { get: jest.fn().mockReturnValue(strategy), list: jest.fn().mockReturnValue([strategy]) }
	const service: DataSourceRuntimeService = Object.create(DataSourceRuntimeService.prototype)
	Object.defineProperties(service, {
		repository: { value: repository },
		sources: { value: sources },
		strategies: { value: strategies }
	})
	return { service, source, repository, sources, adapter, runner, strategy, strategies }
}

beforeEach(() => {
	jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
	jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
	jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
	jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
})
afterEach(() => jest.restoreAllMocks())

test('discovers any registered workbench engine without platform names or credential access', async () => {
	const { service, sources, repository, strategy, strategies } = fixture()
	repository.find.mockResolvedValue([
		{ id: 'a', name: 'new database', type: { type: strategy.type } },
		{ id: 'b', name: 'legacy', type: { type: 'legacy' } },
		{ id: 'c', name: 'removed plugin', type: { type: 'missing' } }
	])
	strategies.list.mockReturnValue([strategy, { type: 'legacy' }])
	await expect(service.list(actor)).resolves.toEqual([{ id: 'a', name: 'new database', engine: 'example.engine' }])
	expect(sources.prepareDataSource).not.toHaveBeenCalled()
	expect(strategy.create).not.toHaveBeenCalled()
	expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ where: actorScope() }))
})
function actorScope() {
	return { tenantId: actor.tenantId, organizationId: actor.organizationId }
}
test('passes location to the plugin while preserving saved credentials and options', async () => {
	const { service, source, strategy, runner, adapter } = fixture()
	const location = { database: 'requested', schema: 'sales', engineCatalog: 'plugin-owned' }
	const scoped = await service.open({ actor, dataSourceId: 'ecp', location })
	expect(strategy.create).toHaveBeenCalledWith(source.options)
	expect(strategy.create.mock.calls[0][0]).not.toBe(source.options)
	expect(runner.getWorkbenchAdapter).toHaveBeenCalledWith(location)
	expect(runner.getWorkbenchAdapter.mock.calls[0][0]).not.toBe(location)
	expect(source.options.catalog).toBe('DEFAULT_SCHEMA')
	expect(scoped.engine).toBe('example.engine')
	expect(scoped).not.toHaveProperty('options')
	const signal = new AbortController().signal
	await scoped.query({ sql: 'SELECT 1', mode: 'read' }, signal)
	expect(adapter.query).toHaveBeenCalledWith({ sql: 'SELECT 1', mode: 'read' }, signal)
	await scoped.close()
	await scoped.close()
	expect(adapter.close).toHaveBeenCalledTimes(1)
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test('leaves an omitted location to the plugin default', async () => {
	const { service, runner } = fixture()
	await (await service.open({ actor, dataSourceId: 'ecp' })).close()
	expect(runner.getWorkbenchAdapter).toHaveBeenCalledWith(undefined)
})
test('cleans up when plugin location validation rejects before opening a connection', async () => {
	const { service, runner } = fixture()
	runner.getWorkbenchAdapter.mockImplementation(() => {
		throw new Error('plugin_location_denied')
	})
	await expect(service.open({ actor, dataSourceId: 'ecp', location: { database: 'other' } })).rejects.toThrow(
		'plugin_location_denied'
	)
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test('rejects unregistered workbench support before creating a runner', async () => {
	const { service, strategy, strategies } = fixture()
	strategies.get.mockReturnValue({ ...strategy, workbench: undefined })
	await expect(service.open({ actor, dataSourceId: 'ecp' })).rejects.toThrow('Database plugin upgrade required')
	expect(strategy.create).not.toHaveBeenCalled()
})
test('cleans up when a plugin advertises a different adapter engine', async () => {
	const { service, adapter, runner } = fixture()
	adapter.engine = 'wrong'
	await expect(service.open({ actor, dataSourceId: 'ecp' })).rejects.toThrow('does not match its registration')
	expect(adapter.close).toHaveBeenCalledTimes(1)
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test('scope mismatch and revoked permissions fail before datasource access', async () => {
	const { service, sources } = fixture()
	await expect(service.open({ actor: { ...actor, organizationId: 'other' }, dataSourceId: 'ecp' })).rejects.toThrow(
		'scope mismatch'
	)
	jest.mocked(RequestContext.hasPermission).mockReturnValue(false)
	await expect(service.open({ actor, dataSourceId: 'ecp' })).rejects.toThrow('permission denied')
	expect(sources.prepareDataSource).not.toHaveBeenCalled()
})
test('rechecks permissions and source revision on every query', async () => {
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
test('tears down inconsistent plugins that do not provide a workbench', async () => {
	const { service, runner, strategy, strategies } = fixture()
	strategy.create.mockResolvedValue({ teardown: runner.teardown })
	await expect(service.open({ actor, dataSourceId: 'ecp' })).rejects.toThrow('Database plugin upgrade required')
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test('cleanup still tears down the runner when adapter close fails', async () => {
	const { service, adapter, runner } = fixture()
	const scoped = await service.open({ actor, dataSourceId: 'ecp' })
	adapter.close.mockRejectedValue(new Error('close failed'))
	await expect(scoped.close()).rejects.toThrow('close failed')
	await scoped.close()
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test('source revision changes close the existing connection', async () => {
	const { service, repository, source, runner } = fixture()
	const scoped = await service.open({ actor, dataSourceId: 'ecp' })
	repository.findOne.mockResolvedValue({ ...source, updatedAt: new Date(2000) })
	await expect(scoped.locations()).rejects.toThrow('Data source changed')
	expect(runner.teardown).toHaveBeenCalledTimes(1)
})
test.each(['tenantId', 'organizationId', 'userId'] as const)('rechecks %s identity on each call', async (field) => {
	const { service, adapter } = fixture()
	const scoped = await service.open({ actor, dataSourceId: 'ecp' })
	const method =
		field === 'tenantId' ? 'currentTenantId' : field === 'organizationId' ? 'getOrganizationId' : 'currentUserId'
	jest.mocked(RequestContext[method]).mockReturnValue('different')
	await expect(scoped.query({ sql: 'SELECT 1', mode: 'read' })).rejects.toThrow('scope mismatch')
	expect(adapter.query).not.toHaveBeenCalled()
	await scoped.close()
})
