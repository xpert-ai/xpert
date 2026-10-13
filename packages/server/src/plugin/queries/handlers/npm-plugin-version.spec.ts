import Config from '@npmcli/config'
import { createServer, IncomingHttpHeaders, Server, ServerResponse } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NpmPluginVersionClient } from './npm-plugin-version'

describe('NpmPluginVersionClient', () => {
	let server: Server
	let registry: string
	let directory: string
	let client: NpmPluginVersionClient
	let respond: (response: ServerResponse) => void
	let requests: Array<{ url: string; headers: IncomingHttpHeaders; port: number }>

	beforeAll(async () => {
		server = createServer((request, response) => {
			requests.push({ url: request.url ?? '', headers: request.headers, port: request.socket.remotePort })
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
		directory = await mkdtemp(join(tmpdir(), 'xpert-npm-version-'))
		await writeFile(join(directory, 'package.json'), '{"name":"version-query-test","version":"1.0.0"}')
		jest.spyOn(process, 'cwd').mockReturnValue(directory)
		jest.replaceProperty(process, 'env', {
			HOME: directory,
			npm_config_registry: registry,
			npm_config_noproxy: '127.0.0.1',
			npm_config_userconfig: join(directory, 'user.npmrc'),
			npm_config_globalconfig: join(directory, 'global.npmrc'),
			npm_config_cache: join(directory, 'cache')
		})
		requests = []
		respond = (response) => {
			response.setHeader('content-type', 'application/json')
			response.end(JSON.stringify({ latest: '1.2.3', beta: '2.0.0-beta.1' }))
		}
		client = new NpmPluginVersionClient()
	})

	afterEach(async () => {
		jest.restoreAllMocks()
		server.closeAllConnections()
		await rm(directory, { recursive: true, force: true })
	})

	it('requests only version tags for scoped and unscoped packages and reuses the connection', async () => {
		await expect(client.resolveLatestVersion('@xpert-ai/plugin-documents')).resolves.toBe('1.2.3')
		await expect(client.resolveLatestVersion('another-plugin')).resolves.toBe('1.2.3')
		expect(requests.map(({ url }) => url)).toEqual([
			'/-/package/%40xpert-ai%2Fplugin-documents/dist-tags',
			'/-/package/another-plugin/dist-tags'
		])
		expect(requests[1].port).toBe(requests[0].port)
	})

	it('loads npm settings once across simultaneous queries without changing the API environment', async () => {
		const load = jest.spyOn(Config.prototype, 'load')
		process.env.npm_config_omit = 'dev'
		const environment = { ...process.env }
		await expect(
			Promise.all(['a', 'b', 'c', 'd'].map((name) => client.resolveLatestVersion(name)))
		).resolves.toEqual(Array(4).fill('1.2.3'))
		expect(load).toHaveBeenCalledTimes(1)
		expect(requests).toHaveLength(4)
		expect(process.env).toEqual(environment)
	})

	it('honors project scoped registries, interpolated user tokens and the configured tag', async () => {
		process.env.TEST_NPM_TOKEN = 'test-only-private-token'
		await writeFile(join(directory, '.npmrc'), `@private:registry=${registry}/private/\ntag=beta\n`)
		const authHost = registry.replace('http:', '')
		await writeFile(join(directory, 'user.npmrc'), `${authHost}/private/:_authToken=\${TEST_NPM_TOKEN}\n`)
		await expect(client.resolveLatestVersion('@private/plugin')).resolves.toBe('2.0.0-beta.1')
		expect(requests[0].url).toBe('/private/-/package/%40private%2Fplugin/dist-tags')
		expect(requests[0].headers.authorization).toBe('Bearer test-only-private-token')
		await client.resolveLatestVersion('public-plugin')
		expect(requests[1].headers.authorization).toBeUndefined()
	})

	it('honors environment settings over project settings and reads global npm configuration', async () => {
		process.env.NPM_CONFIG_TAG = 'beta'
		await writeFile(join(directory, '.npmrc'), `registry=${registry}/project/\ntag=latest\n`)
		await writeFile(join(directory, 'global.npmrc'), `@private:registry=${registry}/global/\n`)
		await expect(client.resolveLatestVersion('public-plugin')).resolves.toBe('2.0.0-beta.1')
		await client.resolveLatestVersion('@private/plugin')
		expect(requests.map(({ url }) => url)).toEqual([
			'/-/package/public-plugin/dist-tags',
			'/global/-/package/%40private%2Fplugin/dist-tags'
		])
	})

	it('honors the configured HTTP proxy without contacting the registry directly', async () => {
		process.env.npm_config_registry = 'http://registry.invalid/'
		process.env.npm_config_proxy = registry
		await expect(client.resolveLatestVersion('plugin')).resolves.toBe('1.2.3')
		expect(requests[0].url).toBe('http://registry.invalid/-/package/plugin/dist-tags')
	})

	it.each([{}, { beta: '2.0.0' }, { latest: 123 }, null, ['1.2.3']])(
		'preserves a missing version for an unexpected registry response %j',
		async (body) => {
			respond = (response) => response.end(JSON.stringify(body))
			await expect(client.resolveLatestVersion('plugin')).resolves.toBeUndefined()
		}
	)

	it.each([401, 404])('fails promptly on HTTP %i without retrying', async (status) => {
		respond = (response) => {
			response.writeHead(status)
			response.end('{"error":"unavailable"}')
		}
		await expect(client.resolveLatestVersion('plugin')).rejects.toThrow()
		expect(requests).toHaveLength(1)
	})

	it.each([429, 503])('recovers from one temporary HTTP %i failure', async (status) => {
		respond = (response) => {
			if (requests.length === 1) {
				response.writeHead(status)
				response.end('{"error":"temporarily unavailable"}')
				return
			}
			response.end('{"latest":"1.2.3"}')
		}
		await expect(client.resolveLatestVersion('plugin')).resolves.toBe('1.2.3')
		expect(requests).toHaveLength(2)
	})

	it('recovers from one connection reset', async () => {
		respond = (response) => {
			if (requests.length === 1) {
				response.destroy()
				return
			}
			response.end('{"latest":"1.2.3"}')
		}
		await expect(client.resolveLatestVersion('plugin')).resolves.toBe('1.2.3')
		expect(requests).toHaveLength(2)
	})

	it('stops after one short retry when HTTP 503 persists', async () => {
		respond = (response) => {
			response.writeHead(503)
			response.end('{"error":"unavailable"}')
		}
		await expect(client.resolveLatestVersion('plugin')).rejects.toThrow()
		expect(requests).toHaveLength(2)
	})

	it('keeps the original cancellation deadline when a retry stalls', async () => {
		const timeout = AbortSignal.timeout.bind(AbortSignal)
		const deadline = jest.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(500))
		let closed: Promise<void> | undefined
		respond = (response) => {
			if (requests.length === 1) {
				response.writeHead(503)
				response.end('{"error":"temporarily unavailable"}')
				return
			}
			closed = new Promise((resolve) => response.once('close', resolve))
			response.writeHead(200, { 'content-type': 'application/json' })
			response.write('{"latest":')
		}
		await expect(client.resolveLatestVersion('plugin')).rejects.toThrow()
		expect(requests).toHaveLength(2)
		expect(deadline).toHaveBeenCalledTimes(1)
		expect(deadline).toHaveBeenCalledWith(10_000)
		await closed
	})

	it('rejects malformed JSON', async () => {
		respond = (response) => response.end('invalid json')
		await expect(client.resolveLatestVersion('plugin')).rejects.toThrow()
	})

	it('aborts a stalled response body at the total request deadline and allows a later query', async () => {
		const timeout = AbortSignal.timeout.bind(AbortSignal)
		const deadline = jest.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(100))
		let closed: Promise<void> | undefined
		respond = (response) => {
			closed = new Promise((resolve) => response.once('close', resolve))
			response.writeHead(200, { 'content-type': 'application/json' })
			response.write('{"latest":')
		}
		await expect(client.resolveLatestVersion('stalled')).rejects.toThrow()
		expect(deadline).toHaveBeenCalledWith(10_000)
		await closed
		respond = (response) => response.end('{"latest":"2.0.0"}')
		await expect(client.resolveLatestVersion('healthy')).resolves.toBe('2.0.0')
	})

	it('allows configuration loading to recover after a failure', async () => {
		jest.spyOn(Config.prototype, 'load').mockRejectedValueOnce(new Error('Configuration unavailable'))
		await expect(client.resolveLatestVersion('plugin')).rejects.toThrow('Configuration unavailable')
		await expect(client.resolveLatestVersion('plugin')).resolves.toBe('1.2.3')
	})

	it('reloads changed npm settings after five minutes', async () => {
		let now = Date.now()
		jest.spyOn(Date, 'now').mockImplementation(() => now)
		await expect(client.resolveLatestVersion('plugin')).resolves.toBe('1.2.3')
		await writeFile(join(directory, '.npmrc'), 'tag=beta\n')
		await expect(client.resolveLatestVersion('plugin')).resolves.toBe('1.2.3')
		now += 5 * 60 * 1000
		await expect(client.resolveLatestVersion('plugin')).resolves.toBe('2.0.0-beta.1')
	})
})
