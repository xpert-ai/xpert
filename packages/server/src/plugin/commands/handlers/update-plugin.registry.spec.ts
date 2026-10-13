import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, Server, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginInstanceService } from '../../plugin-instance.service'
import { PluginManagementService } from '../../plugin-management.service'
import { ResolveLatestPluginVersionHandler } from '../../queries/handlers/resolve-latest-plugin-version.handler'
import { ResolveLatestPluginVersionQuery } from '../../queries/resolve-latest-plugin-version.query'
import { UpdatePluginCommand } from '../update-plugin.command'
import { UpdatePluginHandler } from './update-plugin.handler'

jest.mock('@xpert-ai/contracts', () => ({
	PLUGIN_LEVEL: { SYSTEM: 'system', TENANT: 'tenant', ORGANIZATION: 'organization' },
	RolesEnum: { SUPER_ADMIN: 'SUPER_ADMIN' }
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	RequestContext: { getOrganizationId: () => 'org-1' },
	getErrorMessage: (error: Error) => error.message
}))
jest.mock('../../plugin-instance.service', () => ({ PluginInstanceService: class {} }))
jest.mock('../../plugin-management.service', () => ({ PluginManagementService: class {} }))

describe('plugin updates through the npm registry client', () => {
	let server: Server
	let registry: string
	let directory: string
	let requests: number
	let respond: (response: ServerResponse) => void
	const packageName = '@test/plugin'
	const config = { endpoint: 'https://plugin.example.test', enabled: true }

	beforeAll(async () => {
		server = createServer((_request, response) => {
			requests++
			respond(response)
		})
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
		const address = server.address()
		if (!address || typeof address === 'string') throw new Error('Expected a TCP registry listener')
		registry = `http://127.0.0.1:${address.port}`
	})

	afterAll(async () => {
		server.closeAllConnections()
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
	})

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), 'xpert-plugin-update-'))
		await writeFile(join(directory, 'package.json'), '{"name":"plugin-update-test","version":"1.0.0"}')
		jest.spyOn(process, 'cwd').mockReturnValue(directory)
		jest.replaceProperty(process, 'env', {
			HOME: directory,
			npm_config_registry: registry,
			npm_config_noproxy: '127.0.0.1',
			npm_config_userconfig: join(directory, 'user.npmrc'),
			npm_config_globalconfig: join(directory, 'global.npmrc'),
			npm_config_cache: join(directory, 'cache')
		})
		requests = 0
		respond = (response) => response.end('{"latest":"1.2.3"}')
	})

	afterEach(async () => {
		jest.restoreAllMocks()
		server.closeAllConnections()
		await rm(directory, { recursive: true, force: true })
	})

	async function createUpdater(currentVersion: string) {
		const versions = new ResolveLatestPluginVersionHandler()
		const installPlugin = jest.fn().mockResolvedValue({ success: true, name: packageName, currentVersion: '1.2.3' })
		const module = await Test.createTestingModule({
			providers: [
				UpdatePluginHandler,
				{
					provide: PluginManagementService,
					useValue: {
						findLoadedPlugin: () => ({
							name: packageName,
							packageName,
							organizationId: 'org-1',
							scopeKey: 'org-1',
							source: 'npm',
							instance: { meta: { version: currentVersion } }
						}),
						installPlugin
					}
				},
				{
					provide: PluginInstanceService,
					useValue: {
						getDefaultTenantId: async () => 'default-tenant',
						findOneByPluginName: async () => ({ source: 'npm', config }),
						getConfig: () => config
					}
				},
				{
					provide: QueryBus,
					useValue: { execute: (query: ResolveLatestPluginVersionQuery) => versions.execute(query) }
				}
			]
		}).compile()
		return { module, updater: module.get(UpdatePluginHandler), versions, installPlugin }
	}

	it('retries a failed page version check and immediately updates using the recovered cached version', async () => {
		respond = (response) => {
			if (requests === 1) {
				response.writeHead(503)
				response.end('{"error":"temporarily unavailable"}')
				return
			}
			response.end('{"latest":"1.2.3"}')
		}
		const { module, updater, versions, installPlugin } = await createUpdater('1.0.0')
		try {
			await expect(versions.execute(new ResolveLatestPluginVersionQuery(packageName))).resolves.toBe('1.2.3')
			await expect(updater.execute(new UpdatePluginCommand(packageName))).resolves.toMatchObject({
				success: true,
				updated: true,
				previousVersion: '1.0.0',
				latestVersion: '1.2.3'
			})
			expect(installPlugin).toHaveBeenCalledTimes(1)
			expect(installPlugin).toHaveBeenCalledWith({
				pluginName: packageName,
				version: '1.2.3',
				source: 'npm',
				config
			})
			expect(requests).toBe(2)
		} finally {
			await module.close()
		}
	})

	it('keeps an already current plugin installed without reinstalling it', async () => {
		const { module, updater, installPlugin } = await createUpdater('1.2.3')
		try {
			await expect(updater.execute(new UpdatePluginCommand(packageName))).resolves.toMatchObject({
				success: true,
				updated: false,
				currentVersion: '1.2.3',
				latestVersion: '1.2.3'
			})
			expect(installPlugin).not.toHaveBeenCalled()
			expect(requests).toBe(1)
		} finally {
			await module.close()
		}
	})
})
