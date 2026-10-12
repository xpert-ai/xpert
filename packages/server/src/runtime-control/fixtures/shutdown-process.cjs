// Isolated real Node/Nest process: no platform database or external Redis is required.
const fs = require('node:fs')
const path = require('node:path')
const { Module: NodeModule, createRequire } = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../../../..')

function loadSource(relative, dependencies = {}) {
	const filename = path.join(root, relative)
	const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.CommonJS,
			experimentalDecorators: true,
			emitDecoratorMetadata: true,
			esModuleInterop: true
		}
	}).outputText
	const loaded = new NodeModule(filename, module)
	const localRequire = createRequire(filename)
	loaded.filename = filename
	loaded.paths = NodeModule._nodeModulePaths(path.dirname(filename))
	loaded.require = (name) => (Object.hasOwn(dependencies, name) ? dependencies[name] : localRequire(name))
	loaded._compile(output, filename)
	return loaded.exports
}

async function main() {
	require('reflect-metadata')
	const { Module, Controller, Sse, Get } = require('@nestjs/common')
	const { NestFactory, DiscoveryModule } = require('@nestjs/core')
	const { Observable } = require('rxjs')
	await require('i18next').init({ lng: 'en', resources: {} })
	const mode = process.argv[2]
	const step = loadSource('packages/server/src/runtime-control/shutdown-step.ts')
	const { enableRuntimeShutdown } = loadSource('packages/server/src/runtime-control/runtime-shutdown.ts', {
		'./shutdown-step': step
	})
	const mark = (stage) => process.send?.({ stage })
	const lifecycleModule = loadSource('packages/server/src/runtime-control/runtime-lifecycle.service.ts')
	const queueModule = loadSource('packages/server/src/runtime-control/runtime-queue-shutdown.service.ts', {
		'./shutdown-step': step
	})
	const { prepareApiShutdown } = loadSource('packages/server/src/runtime-control/runtime-shutdown-preparation.ts', {
		'./runtime-lifecycle.service': lifecycleModule,
		'./runtime-queue-shutdown.service': queueModule
	})
	const { RuntimeDrainMiddleware } = loadSource('packages/server/src/runtime-control/runtime-drain.middleware.ts', {
		'./runtime-lifecycle.service': lifecycleModule
	})
	const lifecycle = new lifecycleModule.RuntimeLifecycleService()
	let queueClosed = false
	const Bull = require('bull')
	const queue = Object.assign(Object.create(Bull.prototype), {
		name: 'http-work',
		pause: async () => mark('queue-paused'),
		close: async () => {
			queueClosed = true
			mark('queue-closed')
		},
		add: async () => {
			if (queueClosed) throw new Error('Connection is closed.')
			mark('http-job-enqueued')
		}
	})
	const providers = [
		{
			provide: 'close-observer',
			useValue: {
				onModuleDestroy() {
					mark('destroy')
					if (mode === 'stuck-hook') return new Promise(() => {})
				}
			}
		}
	]
	const { AgentChatRealtimeService } = loadSource('packages/server-ai/src/handoff/agent-chat-realtime.service.ts', {
		'@xpert-ai/server-core': { REDIS_CLIENT: 'REDIS_CLIENT', ...step },
		'@xpert-ai/contracts': loadSource('packages/contracts/src/runtime-control.ts'),
		'./commands': { StopHandoffMessageCommand: class {} }
	})
	const subscriber = {
		isOpen: true,
		connect: async () => {},
		subscribe: async () => {},
		disconnect: async () => {
			mark('redis-disconnected')
			subscriber.isOpen = false
		}
	}
	const realtime = new AgentChatRealtimeService(
		{ duplicate: () => subscriber },
		{ execute: async () => mark('cancelled') }
	)
	providers.push({ provide: AgentChatRealtimeService, useValue: realtime })
	providers.push(
		queueModule.RuntimeQueueShutdownService,
		{ provide: 'http-queue', useValue: queue },
		{ provide: lifecycleModule.RuntimeLifecycleService, useValue: lifecycle }
	)
	class StreamController {
		async work() {
			mark('http-started')
			await new Promise((resolve) => setTimeout(resolve, 200))
			await queue.add()
			return { queued: true }
		}

		stream() {
			return mode === 'raw-sse'
				? new Observable(() => {})
				: realtime.createStream('shutdown-test', async () => {})
		}
	}
	Controller()(StreamController)
	Sse('/stream')(
		StreamController.prototype,
		'stream',
		Object.getOwnPropertyDescriptor(StreamController.prototype, 'stream')
	)
	Get('/work')(
		StreamController.prototype,
		'work',
		Object.getOwnPropertyDescriptor(StreamController.prototype, 'work')
	)
	class Root {}
	Module({ imports: [DiscoveryModule], controllers: [StreamController], providers })(Root)
	const app = await NestFactory.create(Root, {
		logger: mode === 'http-drain' ? ['debug', 'log', 'warn', 'error'] : false,
		forceCloseConnections: true
	})
	const drainMiddleware = new RuntimeDrainMiddleware(lifecycle)
	app.use(drainMiddleware.use.bind(drainMiddleware))
	enableRuntimeShutdown(app, {
		timeoutMs: mode === 'slow-prepare' ? 1000 : mode === 'raw-sse' ? 1500 : 500,
		signals: ['SIGTERM'],
		beforeClose:
			mode === 'http-drain'
				? () => prepareApiShutdown(lifecycle, app.get(queueModule.RuntimeQueueShutdownService))
				: mode === 'stuck-prepare'
					? () => new Promise(() => {})
					: mode === 'slow-prepare'
						? async () => {
								await new Promise((resolve) => setTimeout(resolve, 650))
								mark('prepare-finished')
							}
						: undefined
	})
	await app.listen(0, '127.0.0.1')
	process.on('message', () => {
		// Match the production API's self-signal, including a duplicate signal during close.
		process.kill(process.pid, 'SIGTERM')
		process.kill(process.pid, 'SIGTERM')
	})
	process.send({ port: app.getHttpServer().address().port })
}

main().catch((error) => {
	console.error(error)
	process.exit(2)
})
