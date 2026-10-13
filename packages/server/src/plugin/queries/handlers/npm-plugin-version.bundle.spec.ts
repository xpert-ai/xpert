import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import webpack from 'webpack'

it('resolves npm configuration and queries versions from a Node webpack bundle', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'xpert-npm-version-bundle-'))
	const requests: string[] = []
	const server = createServer((request, response) => {
		requests.push(request.url ?? '')
		response.setHeader('content-type', 'application/json')
		response.end('{"latest":"1.2.3"}')
	})
	try {
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
		const address = server.address()
		if (!address || typeof address === 'string') throw new Error('Expected a TCP registry listener')
		const registry = `http://127.0.0.1:${address.port}`
		await symlink(resolve(__dirname, '../../../../../../node_modules'), join(directory, 'node_modules'), 'junction')
		await writeFile(join(directory, 'package.json'), '{"name":"bundle-test","version":"1.0.0"}')
		await writeFile(join(directory, '.npmrc'), `registry=${registry}\n`)
		const source = await readFile(join(__dirname, 'npm-plugin-version.ts'), 'utf8')
		const entry = join(directory, 'client.cjs')
		await writeFile(
			entry,
			transpileModule(source, {
				compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2021, esModuleInterop: true }
			}).outputText
		)
		// Match the API's Node target: bundle application code and keep npm dependencies external.
		const compiler = webpack({
			mode: 'none',
			target: 'node',
			node: false,
			entry,
			output: { path: join(directory, 'out'), filename: 'client.cjs', library: { type: 'commonjs2' } },
			externals: [
				({ request }, callback) => {
					if (!request || request.startsWith('.') || isAbsolute(request)) return callback()
					callback(null, `commonjs ${request}`)
				}
			]
		})
		try {
			await new Promise<void>((resolve, reject) => {
				compiler.run((error, stats) => {
					if (error) return reject(error)
					if (stats?.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })))
					resolve()
				})
			})
		} finally {
			await new Promise<void>((resolve, reject) => compiler.close((error) => (error ? reject(error) : resolve())))
		}
		const { stdout } = await promisify(execFile)(
			process.execPath,
			[
				'-e',
				`const { NpmPluginVersionClient } = require(process.argv[1]);
new NpmPluginVersionClient().resolveLatestVersion('@test/plugin').then(version => process.stdout.write(version));`,
				join(directory, 'out/client.cjs')
			],
			{
				cwd: directory,
				timeout: 15_000,
				env: {
					HOME: directory,
					npm_config_noproxy: '127.0.0.1',
					npm_config_userconfig: join(directory, 'user.npmrc'),
					npm_config_globalconfig: join(directory, 'global.npmrc'),
					npm_config_cache: join(directory, 'cache')
				}
			}
		)
		expect(stdout).toBe('1.2.3')
		expect(requests).toEqual(['/-/package/%40test%2Fplugin/dist-tags'])
	} finally {
		server.closeAllConnections()
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
		await rm(directory, { recursive: true, force: true })
	}
}, 20_000)
