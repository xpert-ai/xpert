import { taskControlTestEntities, seedTaskControlScope } from '../../task-control/testing/task-control.fixture'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { createClient } from 'redis'
import { Queue, Worker } from 'bullmq'
import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { TaskControlModule } from '../../task-control/task-control.module'
import { ManagedConnectionModule } from '../../managed-connection/managed-connection.module'
import { TaskControlStore, TaskControlRunner, ControlRuntimeAdmissionService } from '../../task-control'
import { InstanceRegistryService } from '../../managed-connection/instance-registry.service'
import { ManagedQueueHandlerRegistryService } from '../managed-queue-handler-registry.service'
import { ManagedQueueService } from '../managed-queue.service'
import { AdmittedManagedQueueProcessor } from '../admitted-queue.processor'
import { UserService } from '../../user/user.service'
import type { ManagedQueueEnvelope } from '../constants'

export async function controlRolloutFixture(url: string, redisUrl: string) {
	if (!new URL(url).pathname.endsWith('_test') || new URL(redisUrl).hostname !== '127.0.0.1')
		throw new Error('Disposable local infrastructure required')
	const schema = `control_worker_${randomUUID().replace(/-/g, '')}`
	const database = await new DataSource({
		type: 'postgres',
		uuidExtension: 'pgcrypto',
		url,
		schema,
		extra: { options: `-c search_path=${schema}` },
		entities: taskControlTestEntities
	}).initialize()
	await database.query(`CREATE SCHEMA "${schema}"`)
	await database.synchronize()
	await database.query('CREATE TABLE phase2_tool_receipt (job varchar NOT NULL, event varchar NOT NULL)')
	const redis = createClient({ url: redisUrl })
	await redis.connect()
	const instances = new InstanceRegistryService(redis)
	await instances.onModuleInit()
	const handlers = new ManagedQueueHandlerRegistryService()
	const parsed = new URL(redisUrl),
		connection = { host: parsed.hostname, port: Number(parsed.port) }
	const queues = ['plain', 'browser', 'v2', 'v2-browser', 'v3', 'v3-browser'].map(
		(suffix) => new Queue<ManagedQueueEnvelope>(`${schema}-${suffix}`, { connection })
	)
	const [plain, browser, legacy, legacyBrowser, admitted, admittedBrowser] = queues
	@Global()
	@Module({ providers: [{ provide: DataSource, useValue: database }], exports: [DataSource] })
	class TestDatabaseModule {}
	@Module({
		providers: [{ provide: InstanceRegistryService, useValue: instances }],
		exports: [InstanceRegistryService]
	})
	class TestInstancesModule {}
	const module = await Test.createTestingModule({
		imports: [TestDatabaseModule, TaskControlModule],
		providers: [
			AdmittedManagedQueueProcessor,
			{ provide: ManagedQueueHandlerRegistryService, useValue: handlers },
			{ provide: UserService, useValue: {} }
		]
	})
		.overrideModule(ManagedConnectionModule)
		.useModule(TestInstancesModule)
		.compile()
	const controls = module.get(TaskControlStore),
		runner = module.get(TaskControlRunner),
		admission = module.get(ControlRuntimeAdmissionService)
	admission.registerManagedQueue(['default', 'sandbox-browser'], () => handlers.controlHandlers())
	const service = new ManagedQueueService(
		plain,
		browser,
		legacy,
		legacyBrowser,
		controls,
		admitted,
		admittedBrowser,
		admission
	)
	const processor = module.get(AdmittedManagedQueueProcessor)
	const workers: Worker[] = []
	const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
	await seedTaskControlScope(database, scope)
	const identity = {
		pluginName: 'isolated-tools',
		queueName: 'work',
		jobName: 'execute',
		controlContract: 'isolated-tools/control-v1'
	}
	const ready = async () => {
		await admission.refresh()
		await instances.setReady(true, Date.now() + 5000)
	}
	return {
		database,
		schema,
		redis,
		instances,
		admission,
		handlers,
		controls,
		runner,
		queues,
		legacy,
		admitted,
		service,
		scope,
		identity,
		ready,
		async worker() {
			const worker = new Worker(admitted.name, (job) => processor.process(job), { connection })
			worker.on('error', () => undefined)
			workers.push(worker)
			await worker.waitUntilReady()
			return worker
		},
		async close() {
			for (const worker of workers) await worker.close(true)
			await module.close()
			await redis.quit()
			for (const queue of queues) {
				await queue.obliterate({ force: true })
				await queue.close()
			}
			await database.query(`DROP SCHEMA "${schema}" CASCADE`)
			await database.destroy()
		}
	}
}
export async function until(condition: () => Promise<boolean>, timeout = 10000) {
	const end = Date.now() + timeout
	while (Date.now() < end) {
		if (await condition()) return
		await new Promise((resolve) => setTimeout(resolve, 25))
	}
	throw new Error('Expected isolated execution state did not arrive')
}
